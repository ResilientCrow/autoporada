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

/** The last Monday the calendar names from `today` (a Prague date): the horizon of slots, window and skips. */
export function lastSlotMonday(today: CalDate): CalDate {
  return addDays(mondayOf(today), 7 * (PLACEMENT_WEEKS - 1));
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
 * past its own week) and after the last virtual Monday stay.
 */
export function issueSlots(
  rows: readonly IssueRow[],
  today: CalDate,
  rule: DeadlineRule,
): readonly IssueSlot[] {
  const stored = new Set(rows.map((row) => toIsoDate(row.monday)));
  const slots: IssueSlot[] = rows.map((row) => ({ ...row, stored: true }));
  const last = lastSlotMonday(today);
  for (let monday = mondayOf(today); compareDates(monday, last) <= 0; monday = addDays(monday, 7)) {
    if (stored.has(toIsoDate(monday))) continue;
    slots.push({ ...virtualRow(monday, rule), stored: false });
  }
  return slots.sort((a, b) => compareDates(a.monday, b.monday));
}

const isOpen = (slot: IssueSlot) => slot.status === 'open';

/**
 * The slot a hand-in at `now` goes to: the first open slot whose close is still ahead, the one
 * the submitter was shown. The close is the slot's deadline, or for a report about an event that
 * ends before the meeting day its own later close (ADR 0035). Skipped and generated slots are
 * stepped over whatever their close, so a point handed in after slot B's deadline cannot reach B
 * through a skipped slot before it that has a later one. A stored slot's deadline is its frozen
 * value, whatever the rule says now. The virtual Mondays go on past the last slot, so there is
 * always an answer.
 */
export function handInMonday(
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
  report?: LateFacts,
): CalDate {
  const closesAhead = (slot: IssueRow) =>
    now.getTime() < (report ? reportCloses(slot, report) : slot.deadlineAt).getTime();
  const found = slots.find((slot) => isOpen(slot) && closesAhead(slot));
  if (found) return found.monday;
  const last = slots.at(-1);
  const start = last ? addDays(last.monday, 7) : mondayOf(instantToWallClock(now).date);
  for (let monday = start; ; monday = addDays(monday, 7)) {
    if (closesAhead(virtualRow(monday, rule))) return monday;
  }
}

/** The slot a hand-in with no close of its own goes to (the first open slot whose deadline is ahead). */
export const submitMonday = (now: Date, slots: readonly IssueSlot[], rule: DeadlineRule): CalDate =>
  handInMonday(now, slots, rule);

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
 * The Mondays the headmaster may skip, and the strip of meetings starts at: from the first slot
 * whose deadline is still ahead, whatever its status (a skipped head Monday can be undone, so it
 * stays in view), to the last slot Monday. Today's skip rule, unchanged until the deadline moves.
 */
export function skipWindow(
  now: Date,
  slots: readonly IssueSlot[],
  rule: DeadlineRule,
): { readonly first: CalDate; readonly last: CalDate } {
  const open = slots.map((slot) => ({ ...slot, status: 'open' as const }));
  return {
    first: submitMonday(now, open, rule),
    last: lastSlotMonday(instantToWallClock(now).date),
  };
}
