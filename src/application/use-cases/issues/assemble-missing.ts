import { readReportsSince } from '@/application/core';
import type { FutureItemRecord, PointRecord, Tx } from '@/application/ports';
import { lateFacts, reportCloses, type PoradaClose } from '@/domain/calendar';
import { placeholderParagraph } from '@/domain/cs';
import { placeholderChecked } from '@/domain/review';
import { richDocFromText, singleLine } from '@/domain/richtext';
import { addDays, compareDates, toIsoDate, type CalDate } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import type { MissingReport } from './assemble-types';

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
 * `eligible` (it is printed as it is), already published, or refused (ADR 0056: a refused report
 * closes its akce, which then prints nothing). Their reports stand as read without scope, so the
 * headmaster sees where a report is without reading it.
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
    if (report?.state === 'published' || report?.state === 'rejected') return [];
    return [{ akce, report }];
  });
}

/**
 * The missing report of `itemId` for the porada of `monday`, or null when that akce is not owed to
 * it or has a report (the same reading the preview and the generation do). The one check
 * `issues.setPlaceholder` and `issues.confirmPlaceholder` share.
 */
export async function missingReportOf(
  tx: Pick<Tx, 'issues' | 'points' | 'futureItems'>,
  monday: CalDate,
  meetingDate: CalDate,
  plannedThrough: CalDate,
  itemId: string,
): Promise<MissingReport | null> {
  const since = await readReportsSince(tx, monday, plannedThrough);
  const eligible = await tx.points.eligibleFor(monday, meetingDate, { since });
  const owed = await owedAkce(tx, since, meetingDate);
  const missing = await missingReports(
    tx,
    owed.filter((a) => a.id === itemId),
    eligible,
  );
  return missing[0] ?? null;
}

/**
 * The placeholders among `missing` the headmaster has not checked (ADR 0061), by the akce's date:
 * no confirmation, or one that is not the paragraph the system writes now.
 */
export async function uncheckedPlaceholders(
  tx: Pick<Tx, 'reportPlaceholders'>,
  missing: readonly MissingReport[],
): Promise<{ id: string; title: string }[]> {
  const stored = new Map(
    (await tx.reportPlaceholders.many(missing.map((m) => m.akce.id))).map((s) => [
      s.futureItemId,
      s.confirmedOriginal,
    ]),
  );
  return missing.flatMap(({ akce }) => {
    const basis = systemParagraph(akce);
    if (basis === null || placeholderChecked(stored.get(akce.id) ?? null, basis)) return [];
    return [{ id: akce.id, title: singleLine(akce.content.title) }];
  });
}

/** When hand-in closes for the akce at `porada` (ADR 0035); null for an akce without a start date. */
export function placeholderCloses(akce: FutureItemRecord, porada: PoradaClose): Date | null {
  const c = akce.content;
  const facts = lateFacts({ eventDate: c.startDate, endDate: c.endDate, timeTo: c.timeTo });
  return facts === undefined ? null : reportCloses(porada, facts);
}

/** An akce's days as the snapshot dates them: the end only when it is after the start. */
export function akceDays(akce: FutureItemRecord): { start: CalDate; end?: CalDate } | null {
  const { startDate: start, endDate: end } = akce.content;
  if (start === null) return null;
  return end !== null && compareDates(end, start) > 0 ? { start, end } : { start };
}

/**
 * The paragraph the system writes for a missing akce (ADR 0060): its date, time, title, place and the organizer and participants as typed. Null
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
    ...(c.timeFrom && { from: c.timeFrom }),
    campus: c.campus,
    ...(c.place && { place: singleLine(c.place) }),
    ...(c.organizer && { organizer: singleLine(c.organizer) }),
    organizerRole: c.organizerRole,
    ...(c.participants && { participants: singleLine(c.participants) }),
    participantsAddress: c.participantsAddress,
  });
}

/**
 * The snapshot's placeholder report of each missing akce: its stored paragraph, else the one the
 * system writes (`systemParagraph`), flagged `missing` so the document adds its fixed line, in
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
