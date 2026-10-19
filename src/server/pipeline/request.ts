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
