import { DEADLINE_RULE } from '@/application/core';
import type { IssueRecord, Tx } from '@/application/ports';
import { PLACEMENT_WEEKS, submitMonday } from '@/domain/calendar';
import { addDays, instantToWallClock, mondayOf, type CalDate } from '@/domain/time';

const WEEK = 7;

/** What the meeting calendar shows at `now`, read once for every use case that needs it. */
export interface IssueWindow {
  /** The rows from the current Prague week's Monday to 26 weeks on, earliest first. */
  readonly known: readonly IssueRecord[];
  /** The first Monday whose deadline is still ahead, frozen deadlines counted. */
  readonly first: CalDate;
  /** The last of the 26 Mondays the placement looks at, counting from `first`. */
  readonly last: CalDate;
}

/** The rows around `now` and the Mondays a submission or a skip may name. */
export async function readWindow(tx: Tx, now: Date): Promise<IssueWindow> {
  const current = mondayOf(instantToWallClock(now).date);
  const known = await tx.issues.between(current, addDays(current, WEEK * PLACEMENT_WEEKS));
  const first = submitMonday(now, DEADLINE_RULE, known);
  return { known, first, last: addDays(first, WEEK * (PLACEMENT_WEEKS - 1)) };
}
