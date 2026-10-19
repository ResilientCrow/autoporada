import type { SignInError } from '@/contracts';

/** A 303 to `location`, with optional Set-Cookie headers. */
export function seeOther(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

/** The sign-in page with an error code; `kod` is the request id the user can report. */
export function signInFailed(appOrigin: string, error: SignInError, requestId?: string): string {
  const url = new URL('/prihlaseni', appOrigin);
  url.searchParams.set('chyba', error);
  if (requestId && (error === 'failed' || error === 'unavailable'))
    url.searchParams.set('kod', requestId);
  return url.href;
}
