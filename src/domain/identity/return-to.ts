/** Where a sign-in without a usable return path lands. */
export const HOME_PATH = '/';

const MAX_LENGTH = 512;
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;
/** Pages a sign-in must never come back to: they would start another one. */
const AUTH_PAGES = /^\/auth(?:\/|$)/;
const PROBE_ORIGIN = 'https://x.invalid';

/**
 * A path on this origin to return to after signing in, or HOME_PATH. The
 * raw value is checked, resolved as a browser would, and the result checked
 * again, so tricks like `//evil`, `/\evil`, `/.//evil` or a tab inside the
 * path all go home. Idempotent; the fragment is dropped.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return HOME_PATH;
  if (!PRINTABLE_ASCII.test(raw) || raw.includes('\\') || !SAME_ORIGIN_PATH.test(raw)) {
    return HOME_PATH;
  }
  let resolved: URL;
  try {
    resolved = new URL(raw, PROBE_ORIGIN);
  } catch {
    return HOME_PATH;
  }
  if (resolved.origin !== PROBE_ORIGIN) return HOME_PATH;
  const path = `${resolved.pathname}${resolved.search}`;
  if (!SAME_ORIGIN_PATH.test(path) || path.length > MAX_LENGTH || AUTH_PAGES.test(path)) {
    return HOME_PATH;
  }
  return path;
}
