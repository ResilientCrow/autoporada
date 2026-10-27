import {
  PASTE_MAX_CHARS,
  type KnownName,
  type PasteRejected,
  type PasteResult,
  type PasteRow,
  type Salutation,
} from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { DraftPerson } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { people } from '@/ui/copy';

import { flagsOf, type AddedMany } from './chips-state';

/**
 * What the textarea lets through. The parser is the cap (it keeps whole entries
 * and says `truncated`), so this only keeps megabytes out of state: it is well
 * above `PASTE_MAX_CHARS`, or the browser would cut a name before the parser
 * saw it.
 */
export const PASTE_INPUT_CEILING = 5 * PASTE_MAX_CHARS;

/**
 * The preview of a pasted list (design section 5), as pure steps. A row is
 * keyed by the line it came from, so it keeps its key when the rows around it
 * leave. A row with a doubt about the order of its names starts unchecked, and
 * the salutation is never guessed: a row has none until the author picks one.
 */
export interface PreviewRow {
  readonly key: number;
  readonly row: PasteRow;
  readonly checked: boolean;
  readonly salutation: Salutation | null;
}

export interface Preview {
  readonly rows: readonly PreviewRow[];
  readonly rejected: readonly PasteRejected[];
  readonly truncated: boolean;
}

/** A person to add, and whether the order of the names is still a guess. */
export interface Chosen {
  readonly person: DraftPerson;
  readonly doubt: boolean;
}

/** What the parser compares a row with: the names of the people the author used before. */
export function knownNames(recents: readonly RecentPerson[]): KnownName[] {
  return recents.map(({ givenName, familyName }) => ({ givenName, familyName }));
}

export function previewOf(result: PasteResult): Preview {
  return {
    rows: result.rows.map((row) => ({
      key: row.line,
      row,
      checked: !row.uncertainOrder,
      salutation: null,
    })),
    rejected: result.rejected,
    truncated: result.truncated,
  };
}

function update(preview: Preview, key: number, step: (row: PreviewRow) => PreviewRow): Preview {
  return { ...preview, rows: preview.rows.map((row) => (row.key === key ? step(row) : row)) };
}

export const pickRow = (preview: Preview, key: number, checked: boolean): Preview =>
  update(preview, key, (row) => ({ ...row, checked }));

export const setSalutation = (preview: Preview, key: number, salutation: Salutation | null) =>
  update(preview, key, (row) => ({ ...row, salutation }));

/** „Prohodit jméno a příjmení“: the author has decided, so the doubt is gone. */
export const swapRow = (preview: Preview, key: number): Preview =>
  update(preview, key, ({ row, ...rest }) => ({
    ...rest,
    row: { ...row, givenName: row.familyName, familyName: row.givenName, uncertainOrder: false },
  }));

/** The bulk setter: only rows still at none, checked or not. */
export const salutateRows = (preview: Preview, salutation: Salutation): Preview => ({
  ...preview,
  rows: preview.rows.map((row) => (row.salutation === null ? { ...row, salutation } : row)),
});

/** The person a row stands for: the reading as it is, the salutation as chosen. */
export function personOf({ row, salutation }: PreviewRow): DraftPerson {
  return {
    salutation,
    ...(row.titlesBefore && { titlesBefore: row.titlesBefore }),
    givenName: row.givenName,
    familyName: row.familyName,
    ...(row.titlesAfter && { titlesAfter: row.titlesAfter }),
    ...(row.affiliation && { affiliation: row.affiliation }),
  };
}

/** The checked rows, in order, as people. */
export function chosen(preview: Preview): Chosen[] {
  return preview.rows
    .filter((row) => row.checked)
    .map((row) => ({ person: personOf(row), doubt: row.row.uncertainOrder }));
}

/** The n of „Přidat vybrané (n)“. */
export const chosenCount = (preview: Preview): number =>
  preview.rows.filter((row) => row.checked).length;

/**
 * The preview once `added` people were taken: the first checked rows leave (the
 * field takes them in order), so the ones that did not fit stay for the author.
 */
export function withoutAdded(preview: Preview, added: number): Preview {
  const gone = new Set(
    preview.rows
      .filter((row) => row.checked)
      .slice(0, added)
      .map((row) => row.key),
  );
  return { ...preview, rows: preview.rows.filter((row) => !gone.has(row.key)) };
}

/**
 * What is left after an add: the preview without the added rows, and the text
 * with only the lines still in it, in line order. The lines are numbered again
 * as the text now has them, so a „Zkontrolovat“ reads the same lines and the
 * people just added do not come back. `preview` is null when nothing is left.
 */
export function afterAdd(
  preview: Preview,
  added: number,
): { readonly preview: Preview | null; readonly text: string } {
  const left = withoutAdded(preview, added);
  if (isFinished(left)) return { preview: null, text: '' };
  const lines = [
    ...left.rows.map(({ row }) => ({ line: row.line, source: row.source })),
    ...left.rejected,
  ].sort((a, b) => a.line - b.line);
  const numbered = (line: number) => lines.findIndex((l) => l.line === line) + 1;
  return {
    text: lines.map((l) => l.source).join('\n'),
    preview: {
      ...left,
      rows: left.rows.map((entry) => {
        const line = numbered(entry.row.line);
        return { ...entry, key: line, row: { ...entry.row, line } };
      }),
      rejected: left.rejected.map((r) => ({ ...r, line: numbered(r.line) })),
    },
  };
}

/** Nothing left to show: no row and no rejected line. */
export const isFinished = (preview: Preview): boolean =>
  preview.rows.length === 0 && preview.rejected.length === 0;

/** What is said once after „Zkontrolovat“: the notice for no one, or the counts, and the cut. */
export function checkedMessage(preview: Preview): string {
  if (preview.rows.length === 0 && preview.rejected.length === 0) return people.paste.nothing;
  const read = people.paste.read(preview.rows.length, preview.rejected.length);
  return preview.truncated ? `${read} ${people.paste.truncated}` : read;
}

/**
 * What is said once after the add. A person still needs a look when a chip
 * flag is up (no salutation, a stale class) or the order of their names is
 * still a guess. `doubts` runs parallel to the people given to the batch.
 */
export function pastedMessage(
  batch: AddedMany,
  doubts: readonly boolean[],
  limit: number,
  today: CalDate,
): string {
  if (batch.added === 0) return people.chips.full(limit);
  const needLook = batch.fresh.filter(
    (chip, i) => doubts[i] === true || flagsOf(chip.person, today).length > 0,
  ).length;
  const said = people.paste.added(batch.added, needLook);
  return batch.refused === 0 ? said : `${said} ${people.paste.leftOut(batch.refused)}`;
}
