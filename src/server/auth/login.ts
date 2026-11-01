import { system } from '@/application/ports';
import { beginLogin, beginStepUp } from '@/application/use-cases';
import { safeReturnTo } from '@/domain/identity';

import type { RouteContext } from '../pipeline';
import type { AuthDeps } from './deps';
import { digest, newToken } from './tokens';
import { signInCookie } from './cookies';
import { causeOfRefusal, seeOther, signInError, signInFailed } from './outcome';

type Purpose = 'login' | 'step_up';

/**
 * Starts a sign-in: protocol values, Entra's URL (outside any transaction),
 * the pending sign-in, then a 303 to Entra with the sign-in cookie.
 */
async function start(
  deps: AuthDeps,
  ctx: RouteContext,
  purpose: Purpose,
  returnTo: string,
  prompt?: 'login' | 'select_account',
): Promise<Response> {
  const cookie = newToken();
  const protocol = { state: newToken(), nonce: newToken(), codeVerifier: newToken() };
  const authorization = await deps.idp.authorizationUrl({ ...protocol, ...(prompt && { prompt }) });
  if (!authorization.ok) {
    const { failure, detail } = authorization;
    deps.log.warn({ reqId: ctx.requestId, failure, ...detail }, 'sign-in not started');
    const error = signInError(failure);
    return seeOther(signInFailed(deps.appOrigin, error, { aadsts: detail.aadsts }));
  }
  const input = { cookieSha256: digest(cookie), ...protocol, returnTo };
  const begun =
    purpose === 'login'
      ? await ctx.run(beginLogin, input, system('auth.login'))
      : await ctx.run(beginStepUp, input);
  if (!begun.ok) {
    const cause = causeOfRefusal(begun.error);
    deps.log.warn({ reqId: ctx.requestId, code: begun.error.code, cause }, 'sign-in not started');
    return seeOther(signInFailed(deps.appOrigin, cause));
  }
  return seeOther(authorization.value, [signInCookie(cookie)]);
}

/** GET /auth/login?returnTo=…[&account=select] */
export async function login(
  deps: AuthDeps,
  request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(query.get('returnTo'));
  const selectAccount = query.get('account') === 'select';
  if (ctx.principal && !selectAccount) return seeOther(new URL(returnTo, deps.appOrigin).href);
  return start(deps, ctx, 'login', returnTo, selectAccount ? 'select_account' : undefined);
}

/** GET /auth/step-up?returnTo=…: the signed-in user enters the password again (ADR 0002). */
export async function stepUp(
  deps: AuthDeps,
  request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  return start(deps, ctx, 'step_up', returnTo, 'login');
}
