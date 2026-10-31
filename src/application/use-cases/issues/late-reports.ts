import type { Tx } from '@/application/ports';
import { isLateReport, lateFacts, reportCloses, type LateFacts } from '@/domain/calendar';
import { singleLine } from '@/domain/richtext';
import { addDays, instantToWallClock, type CalDate } from '@/domain/time';

/** A late report the porada still waits for: what to open, what to call it and when it closes. */
export interface LateExpected {
  readonly id: string;
  readonly of: 'akce' | 'point';
  readonly title: string;
  readonly due: Date;
}

/** What the preflight says about late reports: those it may name, and the drafts it may only count. */
export interface LateReportsExpected {
  readonly expected: readonly LateExpected[];
  /** Late drafts of other authors that no akce answers for: counted, never named (SSU-5). */
  readonly hiddenDrafts: number;
}

/**
 * The reports about events that end before the meeting day, are late for the porada (ADR 0035) and
 * are not handed in: the akce nobody has handed a report in for (not started, or started and still
 * a draft or returned; named by the akce), and the principal's own drafts of reports no akce
 * answers for. Other authors' drafts of those are only counted: drafts stay with their author.
 * Sorted by close, then title.
 */
export async function lateReportsExpected(
  tx: Pick<Tx, 'futureItems' | 'points'>,
  slot: { readonly meetingDate: CalDate; readonly deadlineAt: Date },
): Promise<LateReportsExpected> {
  // An end before the deadline's day cannot be late: the earliest candidate ends the day before it.
  const window = {
    from: addDays(instantToWallClock(slot.deadlineAt).date, -1),
    to: addDays(slot.meetingDate, -1),
  };
  const [akce, drafts, draftFacts] = await Promise.all([
    tx.futureItems.awaitingReport(window),
    tx.points.draftReports(window),
    tx.points.draftReportFacts(window),
  ]);
  const candidates: { id: string; of: 'akce' | 'point'; title: string; facts: LateFacts }[] = [
    ...akce.flatMap(({ id, content }) => {
      const lastDay = content.endDate ?? content.startDate;
      const facts = lastDay === null ? undefined : { lastDay, timeTo: content.timeTo };
      return facts === undefined ? [] : [{ id, of: 'akce' as const, title: content.title, facts }];
    }),
    ...drafts.flatMap(({ id, content }) => {
      const facts = lateFacts(content);
      return facts === undefined ? [] : [{ id, of: 'point' as const, title: content.title, facts }];
    }),
  ];
  const expected = candidates
    .filter(({ facts }) => isLateReport(slot, facts))
    .map(({ id, of, title, facts }) => ({
      id,
      of,
      title: singleLine(title),
      due: reportCloses(slot, facts),
    }))
    .sort((a, b) => a.due.getTime() - b.due.getTime() || (a.title < b.title ? -1 : 1));
  const readable = new Set(drafts.map(({ id }) => id));
  const hiddenDrafts = draftFacts.filter(
    ({ id, lastDay, timeTo }) => !readable.has(id) && isLateReport(slot, { lastDay, timeTo }),
  ).length;
  return { expected, hiddenDrafts };
}
