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

/** A directory entry as `GET /users` answers it (the properties the search selects). */
export interface GraphUser {
  readonly id: string;
  readonly displayName: string;
  readonly givenName: string | null;
  readonly surname: string | null;
  readonly mail: string | null;
  readonly userPrincipalName: string;
}

/** Which role the fake demands of a `$search`: ReadBasic suffices, or only `User.Read.All` (S2). */
export type SearchMode = 'readbasic-ok' | 'needs-user-read-all';

const user = (n: number, rest: Omit<GraphUser, 'id'>): GraphUser => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  ...rest,
});
const staff = (n: number, given: string, surname: string, address: string): GraphUser =>
  user(n, {
    displayName: `${given} ${surname}`,
    givenName: given,
    surname,
    mail: `${address}@ssps.cz`,
    userPrincipalName: `${address}@ssps.cz`,
  });

/** Invented people for a search: teachers with diacritics, a guest, a room and a shared mailbox. */
export const GRAPH_USERS: readonly GraphUser[] = [
  staff(1, 'Jana', 'Nováková', 'jana.novakova'),
  staff(2, 'Petr', 'Novák', 'petr.novak'),
  staff(3, 'Šárka', 'Černá', 'sarka.cerna'),
  staff(4, 'Řehoř', 'Dvořák', 'rehor.dvorak'),
  user(5, {
    displayName: 'Eva Svobodová-Králová',
    givenName: 'Eva',
    surname: 'Svobodová-Králová',
    mail: 'eva.svobodova@ssps.cz',
    userPrincipalName: 'eva.svobodova@ssps.cz',
  }),
  user(6, {
    displayName: 'Jan Hostující',
    givenName: 'Jan',
    surname: 'Hostující',
    mail: 'jan.hostujici@example.org',
    userPrincipalName: 'jan.hostujici_example.org#EXT#@ssps.onmicrosoft.com',
  }),
  user(7, {
    displayName: 'Učebna 3.A',
    givenName: null,
    surname: null,
    mail: 'ucebna3a@ssps.cz',
    userPrincipalName: 'ucebna3a@ssps.cz',
  }),
  user(8, {
    displayName: 'Podatelna',
    givenName: 'Podatelna',
    surname: null,
    mail: 'podatelna@ssps.cz',
    userPrincipalName: 'podatelna@ssps.cz',
  }),
];

export interface FakeGraph {
  /** Routes Entra to the TestIdp and Graph to the fake; any other host is unreachable. */
  readonly fetch: GraphFetch;
  /** Mails Graph accepted (a 202, or the request before an `acceptThenDrop`). */
  readonly sent: readonly SentMail[];
  /**
   * One-shot answers for the next calls that pass the checks, in order: one queue for sendMail and
   * for user searches. A bare 202 (or a status of 202) means the normal answer on either route.
   */
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
    /** sendMail calls only: searches are not counted here. */
    calls: number;
    callsInsideTransaction: number;
    /** A token with Entra's Mail.Send, which covers every mailbox: never in a healthy setup. */
    unscopedGrant: boolean;
    /** The decoded `$search` of each user search that passed the checks (before any scripted answer). */
    readonly searches: string[];
    /** Why calls were refused, e.g. `token.audience`, `rbac.scope`, `body.saveToSentItems`, `search.filter`. */
    readonly rejected: string[];
  };
}
