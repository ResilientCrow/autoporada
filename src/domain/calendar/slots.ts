import type { IssueStatus } from '@/domain/review';
import {
  addDays,
  compareDates,
  instantToWallClock,
  mondayOf,
  toIsoDate,
  type CalDate,
} from '@/domain/time';

import { deadline, type DeadlineRule } from './issue-calendar';
import { reportCloses, type LateFacts } from './late-report';

/** Placement never looks further ahead than this many Mondays (the slots `issueSlots` makes). */
export const PLACEMENT_WEEKS = 26;

/** What an issue row says of its porada: the Monday that keys it, its meeting, its frozen deadline and status. */
export interface IssueRow {
  readonly monday: CalDate;
  readonly meetingDate: CalDate;
  readonly deadlineAt: Date;
  readonly status: IssueStatus;
}

/**
 * A porada the calendar can name: a stored row, or a Monday nobody has touched (open, meeting on
 * the Monday, deadline from the rule). The Monday is the key (URLs, `hand_in_monday`,
 * `earliest_monday`); the meeting date is where the porada is held.
 */
export interface IssueSlot extends IssueRow {
  readonly stored: boolean;
}

/** The last Monday the calendar names from `today` (a Prague date): the horizon of slots and window. */
export function lastSlotMonday(today: CalDate): CalDate {
  return addDays(mondayOf(today), 7 * (PLACEMENT_WEEKS - 1));
}

/**
 * The Monday up to and including which the calendar is exactly its rows (ADR 0054 item 1): the
 * later of the stored `plannedThrough` and last week's Monday at `today` (a Prague date), so a
 * past Monday with no row is never a porada.
 */
export function calendarBoundary(plannedThrough: CalDate | null, today: CalDate): CalDate {
  const lastWeek = addDays(mondayOf(today), -7);
  return plannedThrough && compareDates(plannedThrough, lastWeek) > 0 ? plannedThrough : lastWeek;
}

/** A Monday nobody has touched: open, the meeting on the Monday, the deadline counted back from it. */
const virtualRow = (monday: CalDate, rule: DeadlineRule): IssueRow => ({
  monday,
  meetingDate: monday,
  deadlineAt: deadline(monday, rule),
  status: 'open',
});

/**
 * The calendar at `today` (a Prague date): `rows`, as `issues.calendar(today)` reads them, plus
 * a virtual slot for each Monday without a row from this week's Monday up to
 * `PLACEMENT_WEEKS` Mondays, in Monday order. Rows before this week's Monday (a porada moved
 * past its own week) and after the last virtual Monday stay. `plannedThrough` is the effective
 * boundary of the calendar (ADR 0054 item 1): up to and including it the calendar is its rows, a
 * Monday with no row being no porada; null makes every Monday a porada.
 */
export function issueSlots(
  rows: readonly IssueRow[],
  today: CalDate,
  rule: DeadlineRule,
  plannedThrough: CalDate | null,
): readonly IssueSlot[] {
  const stored = new Set(rows.map((row) => toIsoDate(row.monday)));
  const slots: IssueSlot[] = rows.map((row) => ({ ...row, stored: true }));
  const last = lastSlotMonday(today);
  for (let monday = mondayOf(today); compareDates(monday, last) <= 0; monday = addDays(monday, 7)) {
    if (stored.has(toIsoDate(monday))) continue;
    if (plannedThrough && compareDates(monday, plannedThrough) <= 0) continue;
    slots.push({ ...virtualRow(monday, rule), stored: false });
  }
  return slots.sort((a, b) => compareDates(a.monday, b.monday));
}

const isOpen = (slot: IssueSlot) => slot.status === 'open';

/**
 * The slot a hand-in at `now` goes to: the first open slot whose close is still ahead, the one
 * the submitter was shown. The close is the slot's deadline, or for a report about an event that
 * ends before the meeting day its own later close (ADR 0035). Generated slots are
 * stepped over whatever their close. A stored slot's deadline is its frozen
 * value, whatever the rule says now. The virtual Mondays go on past the last slot (and past
 * `plannedThrough`), so there is always an answer: the found slot, or the virtual row it stops at.
 */
export function handInSlot(
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
  report: LateFacts | undefined,
  plannedThrough: CalDate | null,
): IssueRow {
  const closesAhead = (slot: IssueRow) =>
    now.getTime() < (report ? reportCloses(slot, report) : slot.deadlineAt).getTime();
  const found = slots.find((slot) => isOpen(slot) && closesAhead(slot));
  if (found) return found;
  const last = slots.at(-1);
  const first = last ? addDays(last.monday, 7) : mondayOf(instantToWallClock(now).date);
  const afterBoundary = plannedThrough && addDays(plannedThrough, 7);
  const start = afterBoundary && compareDates(afterBoundary, first) > 0 ? afterBoundary : first;
  for (let monday = start; ; monday = addDays(monday, 7)) {
    const row = virtualRow(monday, rule);
    if (closesAhead(row)) return row;
  }
}

/** The Monday of `handInSlot`: what submit stores as `hand_in_monday`. */
export const handInMonday = (
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
  report: LateFacts | undefined,
  plannedThrough: CalDate | null,
): CalDate => handInSlot(now, slots, rule, report, plannedThrough).monday;

/** The slot a hand-in with no close of its own goes to (the first open slot whose deadline is ahead). */
export const submitMonday = (
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
  plannedThrough: CalDate | null,
): CalDate => handInMonday(now, slots, rule, undefined, plannedThrough);

/**
 * Where a point due in `due` is shown: the first open slot from that Monday on whose meeting is
 * today (a Prague date) or later. A porada that is over takes nothing more, however its Monday
 * compares with `due`. `null` when no slot qualifies (the calendar reaches `PLACEMENT_WEEKS`).
 */
export function placementSlot(
  due: CalDate,
  today: CalDate,
  slots: readonly IssueSlot[],
): IssueSlot | null {
  return (
    slots.find(
      (slot) =>
        isOpen(slot) &&
        compareDates(slot.monday, due) >= 0 &&
        compareDates(slot.meetingDate, today) >= 0,
    ) ?? null
  );
}

/**
 * The Monday the strips of meetings start at: the first slot whose deadline is still ahead,
 * whatever its status (the same as the submit Monday, but a generated slot counts).
 */
export function stripStart(
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
  plannedThrough: CalDate | null,
): CalDate {
  return submitMonday(
    now,
    slots.map((slot) => ({ ...slot, status: 'open' as const })),
    rule,
    plannedThrough,
  );
}
