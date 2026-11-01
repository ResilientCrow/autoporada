/**
 * What broke, as the closed set the page names in words (ADR 0044). A failure is
 * classified where it is caught; the request id stays in the log and the
 * `x-request-id` header, and never reaches the screen.
 */
export type FailureCause = 'database-down' | 'timeout' | 'database-setup' | 'stored-data' | 'bug';

/** One key per cause; `Record<FailureCause, …>` fails to compile when a cause is missing or extra. */
const CAUSE_SET = {
  'database-down': true,
  timeout: true,
  'database-setup': true,
  'stored-data': true,
  bug: true,
} as const satisfies Record<FailureCause, true>;

/** Every cause, for what must cover them all (copy, digests). */
export const FAILURE_CAUSES = Object.keys(CAUSE_SET) as readonly FailureCause[];

const DIGEST_PREFIX = 'autoporada:';

/**
 * The digest a page failure carries to `error.tsx`. Next keeps a digest an error already
 * has, so the cause survives to the client in production, where messages do not.
 */
export function failureDigest(cause: FailureCause): string {
  return `${DIGEST_PREFIX}${cause}`;
}

/** The cause a digest names; any other digest (Next's own hash, none at all) is a bug. */
export function causeFromDigest(digest: string | undefined): FailureCause {
  if (digest?.startsWith(DIGEST_PREFIX)) {
    const name = digest.slice(DIGEST_PREFIX.length);
    const cause = FAILURE_CAUSES.find((known) => known === name);
    if (cause) return cause;
  }
  return 'bug';
}
