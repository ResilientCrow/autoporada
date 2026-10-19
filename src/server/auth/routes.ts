import type { RouteSpec } from '../pipeline';
import type { AuthDeps } from '../session';
import { callback } from './callback';
import { login, stepUp } from './login';

/** The sign-in routes, all limited by client address (plan §4). */
export function authRouteSpecs(
  deps: () => AuthDeps,
): Readonly<Record<'login' | 'callback' | 'stepUp', RouteSpec>> {
  return {
    login: {
      name: 'auth.login',
      access: 'public',
      rateLimit: 'auth',
      handle: (request, ctx) => login(deps(), request, ctx),
    },
    callback: {
      name: 'auth.callback',
      access: 'public',
      rateLimit: 'auth',
      handle: (request, ctx) => callback(deps(), request, ctx),
    },
    stepUp: {
      name: 'auth.stepUp',
      access: 'session',
      rateLimit: 'auth',
      handle: (request, ctx) => stepUp(deps(), request, ctx),
    },
  };
}
