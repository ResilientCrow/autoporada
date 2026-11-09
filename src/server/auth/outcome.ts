import type { IdpFailure } from '@/application/ports';
import {
  isAadstsCode,
  isFailureCause,
  type ActionError,
  type FailureCause,
  type SignInError,
} from '@/contracts';

/** A 303 to `location`, with optional Set-Cookie headers. */
export function seeOther(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

/** What a failure may add to the sign-in page's URL beside its error; each is checked again here. */
export interface SignInExtra {
  /** A refusal's AADSTS number, as the IdP adapter extracted it. */
  readonly aadsts?: string | undefined;
  /** Why a sign-out was not recorded. */
  readonly cause?: FailureCause;
}

/**
 * The sign-in page naming what failed (ADR 0044). No request id: it stays in the log. A refusal
 * may carry its AADSTS number and a failed sign-out its cause, each only when it is exactly that;
 * nothing else from Entra or the database reaches the URL.
 */
export function signInFailed(
  appOrigin: string,
  error: SignInError,
  extra: SignInExtra = {},
): string {
  // Branch arch-ui: the Arch sign-in screen says it. A failed step-up comes to someone still
  // signed in, whom `/` would greet with the home page, so that one keeps the classic page.
  const url = new URL(error.startsWith('step-up') ? '/prihlaseni' : '/', appOrigin);
  url.searchParams.set('chyba', error);
  if (error === 'idp-refused' && isAadstsCode(extra.aadsts)) {
    url.searchParams.set('aadsts', extra.aadsts);
  }
  if (error === 'signout-failed' && isFailureCause(extra.cause)) {
    url.searchParams.set('pricina', extra.cause);
  }
  return url.href;
}

const IDP_ERRORS: Readonly<Record<IdpFailure, SignInError>> = {
  cancelled: 'cancelled',
  unavailable: 'unavailable',
  'idp-error': 'idp-refused',
  'invalid-response': 'idp-invalid',
};

/** What the sign-in page calls a failure the IdP adapter reported. */
export const signInError = (failure: IdpFailure): SignInError => IDP_ERRORS[failure];

/**
 * The cause behind a use case that answered not ok where the sign-in flow expects it to succeed:
 * a busy database is a timeout, anything else is a bug.
 */
export function causeOfRefusal(error: ActionError): FailureCause {
  if (error.code === 'busy') return 'timeout';
  if (error.code === 'unavailable') return error.cause;
  return 'bug';
}
