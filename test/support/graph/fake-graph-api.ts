/** The fake Graph's public face: where it listens, what a test can script and what it saw. */
export const GRAPH_ORIGIN = 'https://graph.microsoft.com';
export const GRAPH_BASE = `${GRAPH_ORIGIN}/v1.0`;

/**
 * One scripted answer to a call that passed Graph's checks: a status with
 * Graph's error body, or a 429/503 with its Retry-After, or a body of its own
 * (the 403 body is a guess, so tests vary it).
 */
export type Answer =
  | 202
  | 400
  | 401
  | 403
  | 429
  | 500
  | 503
  | 504
  | { readonly status: number; readonly retryAfter?: string; readonly body?: object };

/** What a caller hands the router: openid-client's requests and the Graph transport's fit. */
export interface GraphRequest {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal | null;
}
export type GraphFetch = (url: string, init: GraphRequest) => Promise<Response>;

export interface SentMail {
  /** The mailbox in the path: the sender. */
  readonly mailbox: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface FakeGraph {
  /** Routes Entra to the TestIdp and Graph to the fake; any other host is unreachable. */
  readonly fetch: GraphFetch;
  /** Mails Graph accepted (a 202, or the request before an `acceptThenDrop`). */
  readonly sent: readonly SentMail[];
  /** One-shot answers for the next calls that pass the checks, in order. */
  script(...answers: readonly Answer[]): void;
  /** The next accepted call records the mail, then the connection resets: maybe sent. */
  acceptThenDrop(): void;
  /** The next accepted call never answers until the caller aborts. */
  hang(): void;
  /** The mailbox leaves the RBAC scope, for good: 403 ErrorAccessDenied. */
  outOfScope(mailbox: string): void;
  /** 403 for the configured mailbox on the next `calls` calls, then normal (RBAC still propagating). */
  rbacPendingFor(calls: number): void;
  readonly seen: {
    calls: number;
    callsInsideTransaction: number;
    /** A token with Entra's Mail.Send, which covers every mailbox: never in a healthy setup. */
    unscopedGrant: boolean;
    /** Why calls were refused, e.g. `token.audience`, `rbac.scope`, `body.saveToSentItems`. */
    readonly rejected: string[];
  };
}
