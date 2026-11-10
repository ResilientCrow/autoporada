import { signOut } from '@/application/use-cases';
import type { FailureCause } from '@/contracts';

import { SESSION_COOKIE, type RouteContext } from '../pipeline';
import type { AuthDeps } from './deps';
import { clearCookie } from './cookies';
import { causeOfRefusal, seeOther, signInFailed } from './outcome';

/**
 * POST /auth/logout with `scope=this|all`. Public, so a stale cookie still
 * gets cleared; the pipeline refuses another origin. Entra's own session
 * stays: the sign-in page that follows offers another account.
 */
export async function logout(
  deps: AuthDeps,
  request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const form = new URLSearchParams(await request.text());
  const everywhere = form.get('scope') === 'all';
  if (ctx.principal) {
    const result = await ctx.run(signOut, { everywhere });
    if (!result.ok) {
      const cause = causeOfRefusal(result.error);
      deps.log.warn({ reqId: ctx.requestId, code: result.error.code, cause }, 'sign-out refused');
      return signOutFailed(deps, cause);
    }
  }
  // Branch arch-ui: back to the Arch UI, whose signed-out screen is its sign-in, as in the prototype.
  const page = new URL('/', deps.appOrigin);
  page.searchParams.set('odhlaseno', everywhere ? 'vsude' : '1');
  return seeOther(page.href, [clearCookie(SESSION_COOKIE)]);
}

/**
 * The database did not record the sign-out, for `cause`. This browser is
 * signed out all the same (its cookie goes), but other devices may still be
 * signed in.
 */
export const signOutFailed = (deps: AuthDeps, cause: FailureCause) =>
  seeOther(signInFailed(deps.appOrigin, 'signout-failed', { cause }), [
    clearCookie(SESSION_COOKIE),
  ]);
