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

import { assertMonday, type DeadlineRule } from './issue-calendar';
import { PLACEMENT_WEEKS, placementSlot, submitMonday, type IssueSlot } from './slots';

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

/** What `pointMonday` reads of a point: its fixed first Monday and the time of its last hand-in. */
interface PlacedPoint {
  /** The Monday it was first handed in for (`earliest_monday`, fixed at that first hand-in). */
  readonly earliest: CalDate;
  /** When it was last handed in: a resubmit sets it; approving, returning and a reviewer's edit keep it. */
  readonly submittedAt: Date;
}

/**
 * The Monday of the slot a handed-in point is shown under (ADR 0018 item 1: a late submit lands
 * in the next issue whose deadline is still ahead). It starts from the later of the point's first
 * Monday and the slot of its last hand-in (`submitMonday` over the slots, skipped and generated
 * ones stepped over), then takes the first open slot from there whose meeting is today or later
 * (`placementSlot`). The hand-in slot is what a resubmit after a retract or a return needs: its
 * `earliest` is the old first Monday, which may be over. A point handed in on time keeps its slot
 * after the deadline, as its hand-in was ahead of it.
 */
export function pointMonday(
  { earliest, submittedAt }: PlacedPoint,
  rule: DeadlineRule,
  now: Date,
  slots: readonly IssueSlot[],
): CalDate | null {
  assertMonday(earliest);
  const handedIn = submitMonday(submittedAt, slots, rule);
  const due = compareDates(earliest, handedIn) >= 0 ? earliest : handedIn;
  return placementSlot(due, instantToWallClock(now).date, slots)?.monday ?? null;
}
