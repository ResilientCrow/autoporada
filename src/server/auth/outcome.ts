import type { SignInError } from '@/contracts';

/** A 303 to `location`, with optional Set-Cookie headers. */
export function seeOther(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

/** Errors that leave something to report: the page shows the request id with them. */
const WITH_CODE: ReadonlySet<SignInError> = new Set(['failed', 'unavailable', 'signout-failed']);

/** The sign-in page with an error code; `kod` is the request id the user can report. */
export function signInFailed(appOrigin: string, error: SignInError, requestId?: string): string {
  const url = new URL('/prihlaseni', appOrigin);
  url.searchParams.set('chyba', error);
  if (requestId && WITH_CODE.has(error)) url.searchParams.set('kod', requestId);
  return url.href;
}
