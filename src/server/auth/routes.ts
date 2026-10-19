import type { RouteSpec } from '../pipeline';
import type { AuthDeps } from '../session';
import { callback } from './callback';
import { clearCookie, SIGN_IN_COOKIE } from './cookies';
import { login, stepUp } from './login';
import { logout, signOutFailed } from './logout';
import { seeOther, signInFailed } from './outcome';

/**
 * The sign-in routes, all limited by client address (plan §4). Whatever
 * throws, the browser still gets a redirect with a code to report.
 */
export function authRouteSpecs(
  deps: () => AuthDeps,
): Readonly<Record<'login' | 'callback' | 'stepUp' | 'logout', RouteSpec>> {
  const failed = (requestId: string, cookies: readonly string[] = []) =>
    seeOther(signInFailed(deps().appOrigin, 'failed', requestId), cookies);
  return {
    login: {
      name: 'auth.login',
      access: 'public',
      rateLimit: 'auth',
      handle: (request, ctx) => login(deps(), request, ctx),
      failure: (requestId) => failed(requestId),
    },
    callback: {
      name: 'auth.callback',
      access: 'public',
      rateLimit: 'auth',
      handle: (request, ctx) => callback(deps(), request, ctx),
      failure: (requestId) => failed(requestId, [clearCookie(SIGN_IN_COOKIE)]),
    },
    logout: {
      name: 'auth.logout',
      access: 'public',
      rateLimit: 'auth',
      handle: (request, ctx) => logout(deps(), request, ctx),
      failure: (requestId) => signOutFailed(deps(), requestId),
    },
    stepUp: {
      name: 'auth.stepUp',
      access: 'session',
      rateLimit: 'auth',
      handle: (request, ctx) => stepUp(deps(), request, ctx),
      failure: (requestId) => failed(requestId),
    },
  };
}
