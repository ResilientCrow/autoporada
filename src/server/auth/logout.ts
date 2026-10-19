import { signOut } from '@/application/use-cases';

import { SESSION_COOKIE, type RouteContext } from '../pipeline';
import type { AuthDeps } from '../session';
import { clearCookie } from './cookies';
import { seeOther, signInFailed } from './outcome';

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
      deps.log.warn({ reqId: ctx.requestId, code: result.error.code }, 'sign-out refused');
      return signOutFailed(deps, ctx.requestId);
    }
  }
  const page = new URL('/prihlaseni', deps.appOrigin);
  page.searchParams.set('odhlaseno', everywhere ? 'vsude' : '1');
  return seeOther(page.href, [clearCookie(SESSION_COOKIE)]);
}

/**
 * The database did not record the sign-out. This browser is signed out all
 * the same (its cookie goes), but other devices may still be signed in.
 */
export const signOutFailed = (deps: AuthDeps, requestId: string) =>
  seeOther(signInFailed(deps.appOrigin, 'signout-failed', requestId), [
    clearCookie(SESSION_COOKIE),
  ]);
