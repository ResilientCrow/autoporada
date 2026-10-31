import type { Tx } from '@/application/ports';
import { DEFAULT_DEADLINE, issueSlots, type IssueSlot } from '@/domain/calendar';
import { instantToWallClock } from '@/domain/time';

/**
 * The deadline rule new issues are made with. M9.7 replaces this constant
 * with a read of the settings; an issue row keeps the deadline it was made
 * with (ADR 0018).
 */
export const DEADLINE_RULE = DEFAULT_DEADLINE;

/**
 * The meeting calendar at `now`: the stored rows from this week on (or with a meeting still
 * ahead) and a virtual slot for each Monday without one, under the deadline rule. One read, which
 * the worker may make too (`issues.calendar` selects only the columns it is granted).
 */
export async function readSlots(tx: Pick<Tx, 'issues'>, now: Date): Promise<readonly IssueSlot[]> {
  const today = instantToWallClock(now).date;
  return issueSlots(await tx.issues.calendar(today), today, DEADLINE_RULE);
}
