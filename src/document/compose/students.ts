import { sortForDocument } from '@/domain/registry';
import type { SnapshotRegistryList } from '@/snapshot';

import type { Run, StudentRow } from '../model';
import { finalText } from './text';

type Entry = SnapshotRegistryList['entries'][number];

const fullName = (e: Entry) => finalText([e.givenName, e.familyName].filter(Boolean).join(' '));

/** Příloha 1 rows: class, then surname; new students bold. */
export function studentRows(lists: readonly SnapshotRegistryList[]): StudentRow[] {
  return sortForDocument(lists.flatMap((l) => l.entries)).map((e) => ({
    name: fullName(e),
    classCode: e.classCode,
    isNew: e.isNew,
  }));
}

/** Point 4: „Jan Novák (1.A), Eva Malá (2.B)“, new students bold. */
export function inlineStudents(list: SnapshotRegistryList): Run[] {
  return sortForDocument(list.entries).flatMap((e, i) => [
    ...(i > 0 ? [{ text: ', ' }] : []),
    { text: `${fullName(e)} (${e.classCode})`, ...(e.isNew && { bold: true }) },
  ]);
}
