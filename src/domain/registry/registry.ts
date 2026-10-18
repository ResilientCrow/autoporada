import { compareStudents, type ClassOrder } from '@/domain/cs';

/** One student on a registry list (Příloha 1, a point-4 exemption list…). */
export interface RegistryEntry {
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly classCode: string;
  readonly addedAt: Date;
  readonly removedAt: Date | null;
  /** Stamped when an issue that lists the entry is generated for the first time. */
  readonly firstPublishedIssueId: string | null;
}

/**
 * Bold in the document: never published before, or first published by this
 * very issue. Stable when the same issue is regenerated.
 */
export function isNewInIssue(
  entry: Pick<RegistryEntry, 'firstPublishedIssueId'>,
  issueId: string,
): boolean {
  return entry.firstPublishedIssueId === null || entry.firstPublishedIssueId === issueId;
}

/**
 * The entries an issue lists. Regenerating an older issue reads the registry
 * as it stood when that issue was first generated, so changes made since for
 * the next issue cannot leak into it.
 */
export function entriesAsOf<E extends Pick<RegistryEntry, 'addedAt' | 'removedAt'>>(
  entries: readonly E[],
  asOf: Date,
): E[] {
  const t = asOf.getTime();
  return entries.filter(
    (e) => e.addedAt.getTime() <= t && (e.removedAt === null || e.removedAt.getTime() > t),
  );
}

/** Document order: class (year first), then surname, then given name. */
export function sortForDocument<
  E extends Pick<RegistryEntry, 'givenName' | 'familyName' | 'classCode'>,
>(entries: readonly E[], order: ClassOrder = {}): E[] {
  return [...entries].sort((a, b) =>
    compareStudents({ ...a, affiliation: a.classCode }, { ...b, affiliation: b.classCode }, order),
  );
}
