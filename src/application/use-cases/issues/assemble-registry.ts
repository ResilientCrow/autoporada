import type { Tx } from '@/application/ports';
import { isNewInIssue, sortForDocument } from '@/domain/registry';
import type { SnapshotRegistryList } from '@/snapshot';

/**
 * The active lists in their order with their entries; `annex1Entries` and `newEntries` feed the
 * preflight, `unstamped` are the printed entries no issue has printed yet (generation marks them).
 */
export async function assembleRegistry(
  tx: Tx,
  issueId: string,
): Promise<{
  readonly lists: SnapshotRegistryList[];
  readonly annex1Entries: number;
  readonly newEntries: number;
  readonly unstamped: readonly string[];
}> {
  const lists: SnapshotRegistryList[] = [];
  let annex1Entries = 0;
  let newEntries = 0;
  const unstamped: string[] = [];
  for (const list of (await tx.registry.lists()).filter((l) => l.active)) {
    const active = sortForDocument(await tx.registry.entries(list.id));
    unstamped.push(...active.filter((e) => e.firstPublishedIssueId === null).map((e) => e.id));
    const entries = active.map((entry) => ({
      givenName: entry.givenName,
      familyName: entry.familyName,
      classCode: entry.classCode,
      isNew: isNewInIssue(entry, issueId),
    }));
    if (list.purpose === 'annex1') annex1Entries += entries.length;
    newEntries += entries.filter((e) => e.isNew).length;
    lists.push({ key: list.key, purpose: list.purpose, docLabel: list.docLabel, entries });
  }
  return { lists, annex1Entries, newEntries, unstamped };
}
