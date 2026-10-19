import type { SESSION_COOKIE } from '../pipeline';

/** The sign-in in progress: 10 minutes, then Entra's answer can no longer be used. */
export const SIGN_IN_COOKIE = '__Host-ap_signin';
const SIGN_IN_SECONDS = 600;

/**
 * __Host- cookies: this origin only, HTTPS, path /. Lax lets the redirect
 * back from Entra carry them. The session cookie has no Max-Age, so it ends
 * with the browser (shared school PCs).
 */
const FLAGS = 'Path=/; Secure; HttpOnly; SameSite=Lax';

export const signInCookie = (value: string) =>
  `${SIGN_IN_COOKIE}=${value}; ${FLAGS}; Max-Age=${SIGN_IN_SECONDS}`;
export const clearCookie = (name: typeof SIGN_IN_COOKIE | typeof SESSION_COOKIE) =>
  `${name}=; ${FLAGS}; Max-Age=0`;
