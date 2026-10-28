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

import { assertMonday, deadline, type DeadlineRule } from './issue-calendar';

/** An issue that has a row: its Monday, its frozen deadline and its status. */
export interface KnownIssue {
  readonly monday: CalDate;
  readonly deadlineAt: Date;
  readonly status: IssueStatus;
}

/** Placement never looks further ahead than this many Mondays (the `issues.window` size). */
export const PLACEMENT_WEEKS = 26;

function byMonday(known: readonly KnownIssue[]): ReadonlyMap<string, KnownIssue> {
  return new Map(known.map((issue) => [toIsoDate(issue.monday), issue]));
}

/**
 * The first Monday, counting from the Monday of the current Prague week, whose
 * deadline is still ahead. That is `targetMonday(now)` unless a known issue
 * has a frozen deadline later than the computed one: a deadline already shown
 * never moves, so such a Monday stays open although `targetMonday` skips it.
 * A known issue's deadline is its frozen row value whatever its status, any
 * other Monday's is computed. Skips and generated issues do not matter here: a
 * point submitted for a skipped Monday is placed later by `placementMonday`.
 * It names the Monday a new submission is for, never where a handed-in point
 * is shown.
 */
export function submitMonday(now: Date, rule: DeadlineRule, known: readonly KnownIssue[]): CalDate {
  const rows = byMonday(known);
  for (let monday = mondayOf(instantToWallClock(now).date); ; monday = addDays(monday, 7)) {
    const closes = rows.get(toIsoDate(monday))?.deadlineAt ?? deadline(monday, rule);
    if (now.getTime() < closes.getTime()) return monday;
  }
}

/** The first Monday on or after today's Prague date: today itself on a Monday. */
function nextMonday(now: Date): CalDate {
  const today = instantToWallClock(now).date;
  return isoWeekday(today) === 1 ? today : addDays(mondayOf(today), 7);
}

/**
 * The Monday a point is shown under: the first one from the later of
 * `earliest` and the first Monday on or after today (Prague) whose issue is
 * not skipped or generated; a Monday without a row is open. A point waiting
 * for review and an approved one are placed alike, so a point handed in on
 * time stays under its Monday while reviewers finish the issue after the
 * deadline, and approving it does not move it; once that porada is over it
 * moves on (and the issue rows only reach back to this week's Monday, so a
 * past Monday would read as open). A late submission is already later:
 * its `earliest` is the submit Monday it was handed in for. `null` when none
 * of the 26 Mondays from the start qualifies. Nothing is written, so skipping
 * and unskipping move points on their own.
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
