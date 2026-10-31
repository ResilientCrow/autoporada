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

/**
 * The reports about events that end before the meeting day, are late for the porada (ADR 0035) and
 * are not handed in: the akce nobody has started a report for, and the reports still with their
 * author. Titles are kept for the preflight, so this reads only what the principal may see (a
 * headmaster sees the akce, not another author's draft). Sorted by close, then title.
 * TODO(m9-verify): drafts are not in a headmaster's read scope, so only the akce show up for them.
 */
export async function lateReportsExpected(
  tx: Pick<Tx, 'futureItems' | 'points'>,
  slot: { readonly meetingDate: CalDate; readonly deadlineAt: Date },
): Promise<LateExpected[]> {
  // An end before the deadline's day cannot be late: the earliest candidate ends the day before it.
  const window = {
    from: addDays(instantToWallClock(slot.deadlineAt).date, -1),
    to: addDays(slot.meetingDate, -1),
  };
  const [akce, drafts] = await Promise.all([
    tx.futureItems.awaitingReport(window),
    tx.points.draftReports(window),
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
  return candidates
    .filter(({ facts }) => isLateReport(slot, facts))
    .map(({ id, of, title, facts }) => ({
      id,
      of,
      title: singleLine(title),
      due: reportCloses(slot, facts),
    }))
    .sort((a, b) => a.due.getTime() - b.due.getTime() || (a.title < b.title ? -1 : 1));
}
