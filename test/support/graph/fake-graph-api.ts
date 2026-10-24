/** The fake Graph's public face: where it listens, what a test can script and what it saw. */
export const GRAPH_ORIGIN = 'https://graph.microsoft.com';
export const GRAPH_BASE = `${GRAPH_ORIGIN}/v1.0`;

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
  /** Mails Graph accepted with a 202. */
  readonly sent: readonly SentMail[];
  /** The mailbox leaves the RBAC scope, for good: 403 ErrorAccessDenied. */
  outOfScope(mailbox: string): void;
  /** 403 for the configured mailbox on the next `calls` calls, then normal (RBAC still propagating). */
  rbacPendingFor(calls: number): void;
  readonly seen: {
    calls: number;
    /** A token with Entra's Mail.Send, which covers every mailbox: never in a healthy setup. */
    unscopedGrant: boolean;
    /** Why calls were refused, e.g. `token.audience`, `rbac.scope`, `body.saveToSentItems`. */
    readonly rejected: string[];
  };
}
