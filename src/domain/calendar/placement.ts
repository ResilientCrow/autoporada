import type { CalDate } from '@/domain/time';

import { assertMonday } from './issue-calendar';
import { dueMonday } from './selection';
import { placementSlot, type IssueSlot } from './slots';

/** What `pointMonday` reads of a point: its fixed first Monday and the Monday of its last hand-in. */
interface PlacedPoint {
  /** The Monday it was first handed in for (`earliest_monday`, fixed at that first hand-in). */
  readonly earliest: CalDate;
  /** The Monday it was last handed in for (`hand_in_monday`, set at every submit). */
  readonly handIn: CalDate;
}

/**
 * The Monday of the slot a handed-in point is shown under (ADR 0018 item 1, ADR 0029): the first
 * open slot from its `dueMonday` whose meeting is today or later (`placementSlot`, generated
 * slots stepped over). A point handed in on time keeps its slot after the deadline, as
 * its hand-in Monday was ahead of it; a resubmit starts from the Monday it was handed in for, as
 * its `earliest` may be over.
 */
export function pointMonday(
  { earliest, handIn }: PlacedPoint,
  today: CalDate,
  slots: readonly IssueSlot[],
): CalDate | null {
  assertMonday(earliest);
  return placementSlot(dueMonday({ earliest, handIn }), today, slots)?.monday ?? null;
}
