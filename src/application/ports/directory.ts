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

export type DirectoryResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: DirectoryCode };

/**
 * People search. It never throws: an adapter catches its own failures and answers a code (ADR 0015),
 * and neither the query nor anything the directory said goes into an error or a log.
 */
export interface DirectoryPort {
  search(query: string, signal: AbortSignal): Promise<DirectoryResult<readonly DirectoryPerson[]>>;
}
