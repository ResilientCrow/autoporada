import type { IssueStatus } from '@/domain/review';
import { compareDates, type CalDate } from '@/domain/time';

import type { IssueSlot } from './slots';

/** A slot whose place in the calendar disagrees with the changed one's. */
export interface OrderConflict {
  readonly monday: CalDate;
  readonly meetingDate: CalDate;
  readonly status: IssueStatus;
}

/**
 * The meeting order (ADR 0034): over the slots that take place (a skipped one is out), meeting
 * dates and deadlines both rise with the Monday that keys them. The non-skipped slots other than
 * `changed` that break it against `changed`: one before it in Monday order whose meeting or
 * deadline is not before the changed slot's own, or one after it whose is not after. Every
 * slot's deadline is at or before 00.00 of its meeting day by the inputs, so the pairs are all
 * there is to check. A generated slot counts, which is why a conflict with one can never be
 * skipped away. Pure; it does not read the slot's own status.
 */
export function orderConflicts(
  slots: readonly IssueSlot[],
  changed: IssueSlot,
): readonly OrderConflict[] {
  return slots
    .filter((slot) => slot.status !== 'skipped' && compareDates(slot.monday, changed.monday) !== 0)
    .filter((slot) => {
      const before = compareDates(slot.monday, changed.monday) < 0;
      const meeting = compareDates(slot.meetingDate, changed.meetingDate);
      const close = slot.deadlineAt.getTime() - changed.deadlineAt.getTime();
      return before ? meeting >= 0 || close >= 0 : meeting <= 0 || close <= 0;
    })
    .map(({ monday, meetingDate, status }) => ({ monday, meetingDate, status }));
}
