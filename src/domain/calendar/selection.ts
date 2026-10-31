import { compareDates, type CalDate } from '@/domain/time';

/**
 * The Monday a handed-in point is due for (ADR 0029): the later of its fixed first Monday and the
 * Monday of its last hand-in. A resubmit after a retract or a return needs the hand-in one, as its
 * `earliest` may be over.
 */
export function dueMonday({
  earliest,
  handIn,
}: {
  readonly earliest: CalDate;
  readonly handIn: CalDate;
}): CalDate {
  return compareDates(earliest, handIn) >= 0 ? earliest : handIn;
}
