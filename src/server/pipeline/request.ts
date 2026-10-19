/** The session cookie (ADR 0002): __Host- keeps it on this origin, over HTTPS, on path /. */
export const SESSION_COOKIE = '__Host-ap_session';

/** A cookie's value from a Cookie header. */
export function cookieValue(header: string | null, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

/**
 * A path on this origin to return to after signing in. Anything that a
 * browser could read as another origin (`//x`, `/\x`) goes home instead.
 */
export function returnPath(url: URL): string {
  const path = `${url.pathname}${url.search}`;
  return /^\/(?![/\\])/.test(path) ? path : '/';
}
