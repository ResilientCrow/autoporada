/** The session cookie (ADR 0002): __Host- keeps it on this origin, over HTTPS, on path /. */
export const SESSION_COOKIE = '__Host-ap_session';

/**
 * A cookie's value from a Cookie header. A cookie sent twice counts as none:
 * a second copy can only come from a sibling subdomain or an attack.
 */
export function cookieValue(header: string | null, name: string): string | null {
  const values = (header?.split(';') ?? [])
    .map((part) => part.trim().split('='))
    .filter(([key]) => key === name)
    .map(([, ...value]) => value.join('='));
  return values.length === 1 && values[0] ? values[0] : null;
}

/**
 * This request's session token, by the rule above. Routes, actions and
 * pages all read it from the raw header: Next's cookies() keeps only the
 * last of two copies, so it cannot see a duplicate.
 */
export const sessionTokenFrom = (cookieHeader: string | null): string | null =>
  cookieValue(cookieHeader, SESSION_COOKIE);
