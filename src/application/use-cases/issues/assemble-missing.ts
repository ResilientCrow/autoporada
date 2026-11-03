import type { FutureItemRecord, PointRecord, Tx } from '@/application/ports';
import { snapshotPerson } from '@/document';
import { placeholderParagraph } from '@/domain/cs';
import { richDocFromText, singleLine } from '@/domain/richtext';
import { addDays, compareDates, toIsoDate, type CalDate } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import type { MissingReport } from './assemble-types';

/** Who writes an akce nobody is named for: the verb is unused without people. */
const DEFAULT_VERB = 'organizuje' as const;

/**
 * The akce this porada owes a report for (ADR 0049): `FutureItemRepo.owedTo` from the previous
 * porada's meeting day (`since`) up to the day before this one.
 */
export function owedAkce(
  tx: Pick<Tx, 'futureItems'>,
  since: CalDate,
  meetingDate: CalDate,
): Promise<readonly FutureItemRecord[]> {
  return tx.futureItems.owedTo({ from: since, to: addDays(meetingDate, -1) });
}

/**
 * The owed akce that have no report for the porada: those of `owed` whose report is not among
 * `eligible` (it is printed as it is) or already published. Their reports stand as read without
 * scope, so the headmaster sees where a report is without reading it.
 */
export async function missingReports(
  tx: Pick<Tx, 'points'>,
  owed: readonly FutureItemRecord[],
  eligible: readonly PointRecord[],
): Promise<readonly MissingReport[]> {
  const printed = new Set(eligible.map((p) => p.id));
  const bound = owed.flatMap((a) => (a.reportPointId === null ? [] : [a.reportPointId]));
  const standing = new Map((await tx.points.statesOf(bound)).map((s) => [s.id, s]));
  return owed.flatMap((akce) => {
    const report = akce.reportPointId === null ? null : (standing.get(akce.reportPointId) ?? null);
    if (akce.reportPointId !== null && printed.has(akce.reportPointId)) return [];
    if (report?.state === 'published') return [];
    return [{ akce, report }];
  });
}

/** An akce's days as the snapshot dates them: the end only when it is after the start. */
export function akceDays(akce: FutureItemRecord): { start: CalDate; end?: CalDate } | null {
  const { startDate: start, endDate: end } = akce.content;
  if (start === null) return null;
  return end !== null && compareDates(end, start) > 0 ? { start, end } : { start };
}

/**
 * The paragraph the system writes for a missing akce: its date, title and the people it names. Null
 * for an akce without a start date, which cannot be dated.
 */
export function systemParagraph(akce: FutureItemRecord): string | null {
  const days = akceDays(akce);
  if (days === null) return null;
  const c = akce.content;
  return placeholderParagraph({
    date: days.start,
    ...(days.end && { endDate: days.end }),
    title: singleLine(c.title),
    verb: c.responsible?.verb ?? DEFAULT_VERB,
    people: (c.responsible?.people ?? []).flatMap((p) => snapshotPerson(p) ?? []),
  });
}

/**
 * The snapshot's placeholder report of each missing akce: its stored paragraph, else the one the
 * system writes (`systemParagraph`), flagged `missing` so the document adds its two fixed lines, in
 * the order of `missing`. An akce without a start date cannot be dated and is left out.
 */
export async function placeholderReports(
  tx: Pick<Tx, 'reportPlaceholders'>,
  missing: readonly MissingReport[],
): Promise<SnapshotReport[]> {
  const stored = new Map(
    (await tx.reportPlaceholders.many(missing.map((m) => m.akce.id))).map((s) => [
      s.futureItemId,
      s.paragraph,
    ]),
  );
  return missing.flatMap(({ akce }): SnapshotReport[] => {
    const days = akceDays(akce);
    const paragraph = stored.get(akce.id) ?? systemParagraph(akce);
    if (days === null || paragraph === null) return [];
    return [
      {
        id: akce.id,
        title: singleLine(akce.content.title),
        date: toIsoDate(days.start),
        ...(days.end && { endDate: toIsoDate(days.end) }),
        body: richDocFromText(paragraph),
        bullets: [],
        statements: [],
        missing: true,
      },
    ];
  });
}
