import { system } from '@/application/ports';
import { completeSignIn, recordRejection, takeSignIn } from '@/application/use-cases';
import type { SignInError } from '@/contracts';
import { checkEntraClaims, safeReturnTo, type ClaimRejection } from '@/domain/identity';

import { errorSummary } from '../log';
import { cookieValue, sessionTokenFrom, type RouteContext } from '../pipeline';
import type { AuthDeps } from './deps';
import { digest, isToken, newToken } from './tokens';
import { clearCookie, sessionCookie, SIGN_IN_COOKIE } from './cookies';
import { seeOther, signInFailed } from './outcome';

const MAX_QUERY = 4096;
const callbackPrincipal = system('auth.callback');

const REJECTIONS: Readonly<Record<ClaimRejection, SignInError>> = {
  tenant: 'not-member',
  guest: 'not-member',
  'stale-auth': 'step-up-stale',
  'missing-claim': 'failed',
  'invalid-claim': 'failed',
};

/**
 * GET /auth/callback: Entra's answer (ADR 0002, design §5). Every exit is a
 * 303 that clears the sign-in cookie; the user sees only an error code.
 */
export async function callback(
  deps: AuthDeps,
  request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const url = new URL(request.url);
  const reqId = ctx.requestId;
  const cleared = clearCookie(SIGN_IN_COOKIE);
  const fail = (error: SignInError) =>
    seeOther(signInFailed(deps.appOrigin, error, reqId), [cleared]);
  /** A replay, a second tab or a stray request: nothing to finish. */
  const nothingToFinish = (reason: string) => {
    deps.log.info({ reqId, reason }, 'sign-in callback without a sign-in');
    return ctx.principal ? seeOther(new URL('/', deps.appOrigin).href, [cleared]) : fail('expired');
  };

  const cookies = request.headers.get('cookie');
  const states = url.searchParams.getAll('state');
  const state = states[0];
  const cookie = cookieValue(cookies, SIGN_IN_COOKIE);
  if (url.search.length > MAX_QUERY || states.length !== 1 || !isToken(state) || !isToken(cookie)) {
    return nothingToFinish('no-sign-in');
  }

  const taken = await ctx.run(
    takeSignIn,
    { cookieSha256: digest(cookie), state },
    callbackPrincipal,
  );
  if (!taken.ok) return fail('failed');
  const signIn = taken.data;
  if (!signIn.found) return nothingToFinish('not-found');
  if (signIn.expired) return fail('expired');

  // The token exchange: a network call, after the sign-in's transaction committed.
  const redeemed = await deps.idp.redeem(url.search, {
    state,
    nonce: signIn.nonce,
    codeVerifier: signIn.codeVerifier,
  });
  if (!redeemed.ok) {
    deps.log.warn(
      { reqId, failure: redeemed.failure, ...redeemed.detail },
      'sign-in not completed',
    );
    if (redeemed.failure === 'cancelled') return fail('cancelled');
    return fail(redeemed.failure === 'unavailable' ? 'unavailable' : 'failed');
  }

  const stepUp = signIn.purpose === 'step_up';
  const checked = checkEntraClaims(redeemed.value, {
    ...deps.expect,
    now: deps.clock.now(),
    ...(stepUp && { reauthenticatedAfter: new Date(signIn.startedAtMs) }),
  });
  if (!checked.ok) {
    const { reason, claim, signals } = checked;
    deps.log.warn({ reqId, reason, claim, signals }, 'sign-in refused');
    // The refusal stands without its audit row; the log says it is missing.
    try {
      const recorded = await ctx.run(
        recordRejection,
        { reason, claim, signals: [...signals], purpose: signIn.purpose, userId: signIn.userId },
        callbackPrincipal,
      );
      if (!recorded.ok) {
        deps.log.error({ reqId, code: recorded.error.code }, 'could not audit a refused sign-in');
      }
    } catch (error) {
      deps.log.error({ reqId, err: errorSummary(error) }, 'could not audit a refused sign-in');
    }
    return fail(REJECTIONS[reason]);
  }

  const { identity } = checked;
  const token = newToken();
  const current = sessionTokenFrom(cookies);
  const completed = await ctx.run(
    completeSignIn,
    {
      purpose: signIn.purpose,
      identity: {
        tid: identity.tid,
        oid: identity.oid,
        displayName: identity.displayName,
        email: identity.email,
      },
      authTime: Math.floor(identity.authTime.getTime() / 1000),
      sessionTokenSha256: digest(token),
      replacesSessionSha256: isToken(current) ? digest(current) : null,
      expectedUserId: signIn.userId,
      bootstrapHeadmasterOid: deps.bootstrapHeadmasterOid,
    },
    callbackPrincipal,
  );
  if (!completed.ok) return fail('failed');
  const outcome = completed.data;
  if (outcome.outcome === 'refused') {
    deps.log.warn({ reqId, reason: outcome.reason }, 'sign-in refused');
    return fail(outcome.reason === 'inactive' ? 'blocked' : 'step-up-mismatch');
  }
  deps.log.info(
    { reqId, userId: outcome.userId, purpose: signIn.purpose, bootstrapped: outcome.bootstrapped },
    'signed in',
  );
  const home = new URL(safeReturnTo(signIn.returnTo), deps.appOrigin).href;
  return seeOther(home, [sessionCookie(token), cleared]);
}
