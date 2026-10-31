import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  compareDates,
  instantToWallClock,
  isoWeekday,
  mondayOf,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import { assertMonday } from './issue-calendar';
import { dueMonday } from './selection';
import { PLACEMENT_WEEKS, placementSlot, type IssueSlot } from './slots';

/** An issue that has a row: its Monday, its frozen deadline and its status. */
export interface KnownIssue {
  readonly monday: CalDate;
  readonly deadlineAt: Date;
  readonly status: IssueStatus;
}

function byMonday(known: readonly KnownIssue[]): ReadonlyMap<string, KnownIssue> {
  return new Map(known.map((issue) => [toIsoDate(issue.monday), issue]));
}

/** The first Monday on or after today's Prague date: today itself on a Monday. */
function nextMonday(now: Date): CalDate {
  const today = instantToWallClock(now).date;
  return isoWeekday(today) === 1 ? today : addDays(mondayOf(today), 7);
}

/**
 * The Monday a point is shown under, scanning from `earliest`: the first one from the later of
 * `earliest` and the first Monday on or after today (Prague) whose issue is not skipped or
 * generated; a Monday without a row is open. A point waiting for review and an approved one are
 * placed alike, so a point handed in on time stays under its Monday while reviewers finish the
 * issue after the deadline, and approving it does not move it; once that porada is over it moves
 * on (and the issue rows only reach back to this week's Monday, so a past Monday would read as
 * open). `null` when none of the 26 Mondays from the start qualifies. Nothing is written, so
 * skipping and unskipping move points on their own.
 *
 * `earliest` alone does not say where a point goes: it is fixed at the first hand-in, so a point
 * handed in again later must start from the Monday of that hand-in, which `pointMonday` does.
 */
export function placementMonday(
  earliest: CalDate,
  now: Date,
  known: readonly KnownIssue[],
): CalDate | null {
  assertMonday(earliest);
  const today = nextMonday(now);
  const start = compareDates(earliest, today) >= 0 ? earliest : today;
  const rows = byMonday(known);
  for (let week = 0; week < PLACEMENT_WEEKS; week++) {
    const monday = addDays(start, 7 * week);
    if (isOpen(rows.get(toIsoDate(monday))?.status)) return monday;
  }
  return null;
}

function isOpen(status: IssueStatus | undefined): boolean {
  return status === undefined || status === 'open';
}

/** What `pointMonday` reads of a point: its fixed first Monday and the Monday of its last hand-in. */
interface PlacedPoint {
  /** The Monday it was first handed in for (`earliest_monday`, fixed at that first hand-in). */
  readonly earliest: CalDate;
  /** The Monday it was last handed in for (`hand_in_monday`, set at every submit). */
  readonly handIn: CalDate;
}

/**
 * The Monday of the slot a handed-in point is shown under (ADR 0018 item 1, ADR 0029): the first
 * open slot from its `dueMonday` whose meeting is today or later (`placementSlot`, skipped and
 * generated slots stepped over). A point handed in on time keeps its slot after the deadline, as
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
