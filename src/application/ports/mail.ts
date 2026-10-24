/** One plain-text message. `dedupeKey` travels with it so a copy can be traced to its job. */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly dedupeKey: string;
}

/** How the provider answered, classified by status, never by response text. */
export type MailResult =
  | { readonly kind: 'sent'; readonly requestId: string | null }
  /** 429, 503, 409: not sent; try again after the delay. */
  | { readonly kind: 'throttled'; readonly retryAfterMs: number; readonly code: string }
  /** Refused, DNS, TLS, identity provider unreachable: provably not sent. */
  | { readonly kind: 'not-sent'; readonly code: string }
  /** Timeout, reset, 500, 502, 504: may have been sent. */
  | { readonly kind: 'unknown'; readonly code: string }
  /** 401 after one token refresh, 403, identity provider refusal. */
  | { readonly kind: 'auth'; readonly code: string }
  /** 400, 404, 413, other 4xx: permanent. */
  | { readonly kind: 'rejected'; readonly code: string };

/** Never throws for a provider outcome; those are `MailResult`s. */
export interface MailPort {
  send(mail: OutgoingMail): Promise<MailResult>;
}
