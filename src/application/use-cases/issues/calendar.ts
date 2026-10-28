import { DEADLINE_RULE } from '@/application/core';
import type { IssueRecord, Tx } from '@/application/ports';
import { PLACEMENT_WEEKS, submitMonday } from '@/domain/calendar';
import { addDays, compareDates, instantToWallClock, mondayOf, type CalDate } from '@/domain/time';

const WEEK = 7;

/** What the meeting calendar shows at `now`, read once for every use case that needs it. */
export interface IssueWindow {
  /** The rows from the current Prague week's Monday to `last`, earliest first. */
  readonly known: readonly IssueRecord[];
  /** The first Monday whose deadline is still ahead, frozen deadlines counted. */
  readonly first: CalDate;
  /** The last of the 26 Mondays the placement looks at, counting from `first`. */
  readonly last: CalDate;
}

/**
 * The rows around `now` and the Mondays a submission or a skip may name. The
 * rows reach `last`: placement scans 26 Mondays from a start no later than
 * `first`, and a skip may name `last`, which lies past 26 weeks from this
 * week's Monday when `first` is two weeks on (Sunday after the deadline), so a
 * skipped Monday there must not read as open.
 */
export async function readWindow(tx: Tx, now: Date): Promise<IssueWindow> {
  const current = mondayOf(instantToWallClock(now).date);
  const end = addDays(current, WEEK * PLACEMENT_WEEKS);
  const near = await tx.issues.between(current, end);
  const first = submitMonday(now, DEADLINE_RULE, near);
  const last = addDays(first, WEEK * (PLACEMENT_WEEKS - 1));
  const tail = compareDates(last, end) > 0 ? await tx.issues.between(addDays(end, WEEK), last) : [];
  return { known: [...near, ...tail], first, last };
}
