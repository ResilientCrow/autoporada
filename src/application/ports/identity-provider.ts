/**
 * Entra, as the sign-in code on the server sees it (implemented in
 * infra/oidc). Both calls make network requests: never inside a transaction.
 */
export interface AuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  /** `login` forces the password (step-up); `select_account` lets the user switch. */
  readonly prompt?: 'login' | 'select_account';
}

/** The claims of an ID token whose signature, issuer, audience, times and nonce were verified. */
export type VerifiedClaims = Readonly<Record<string, unknown>>;

export type IdpFailure = 'cancelled' | 'idp-error' | 'invalid-response' | 'unavailable';

/**
 * What may be logged about a failure: allow-listed codes only, never a
 * message, an error description, a token or a claim value.
 */
export interface IdpDetail {
  readonly stage: 'discovery' | 'authorize' | 'token' | 'id-token';
  readonly code?: string;
  readonly error?: string;
  readonly aadsts?: string;
  readonly status?: number;
}

export type IdpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: IdpFailure; readonly detail: IdpDetail };

export interface IdentityProvider {
  /** Where to send the browser; may run discovery first. */
  authorizationUrl(request: AuthorizationRequest): Promise<IdpResult<string>>;
  /** Redeems the code in the callback's query string and verifies the ID token. */
  redeem(
    callbackSearch: string,
    expected: Omit<AuthorizationRequest, 'prompt'>,
  ): Promise<IdpResult<VerifiedClaims>>;
}
