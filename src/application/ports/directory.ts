/** A person in the school's directory: names only, never a mailbox or a class (design §4). */
export interface DirectoryPerson {
  readonly graphId: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly displayName: string;
}

export type DirectoryCode =
  | 'directory.off'
  | 'directory.unavailable'
  | 'directory.throttled'
  | 'directory.denied'
  | 'directory.timeout';

/**
 * A failure carries its code and, for the log only, a `detail`: a fixed word (`http-4xx`,
 * `http-5xx`, `network`, `body`) or `token:` and the allow-listed parts of the token failure
 * (stage, AADSTS code). Never text the provider or the reader wrote (ADR 0015, 0016).
 */
export type DirectoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: DirectoryCode; readonly detail?: string };

/**
 * People search. It never throws: an adapter catches its own failures and answers a code (ADR 0015),
 * and neither the query nor anything the directory said goes into an error or a log.
 */
export interface DirectoryPort {
  search(query: string, signal: AbortSignal): Promise<DirectoryResult<readonly DirectoryPerson[]>>;
}
