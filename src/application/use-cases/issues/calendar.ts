import { DEADLINE_RULE, readSlots } from '@/application/core';
import type { Tx } from '@/application/ports';
import { submitMonday, type IssueSlot } from '@/domain/calendar';
import type { CalDate } from '@/domain/time';

/** What the meeting calendar shows at `now`, read once for every use case that needs it. */
export interface IssueWindow {
  /** The stored rows from this week on plus the untouched Mondays, in Monday order. */
  readonly slots: readonly IssueSlot[];
  /** The Monday of the first open slot whose deadline is still ahead, frozen deadlines counted. */
  readonly first: CalDate;
}

/** The slots around `now` and the Monday a submission is for. */
export async function readWindow(tx: Tx, now: Date): Promise<IssueWindow> {
  const slots = await readSlots(tx, now);
  return { slots, first: submitMonday(now, slots, DEADLINE_RULE) };
}
