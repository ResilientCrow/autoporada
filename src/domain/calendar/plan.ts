import { addDays, compareDates, instantToWallClock, isSameDate, type CalDate } from '@/domain/time';

import { deadline, slotMondayOf, type DateRange, type DeadlineRule } from './issue-calendar';
import { orderConflicts } from './order';
import { lastSlotMonday, type IssueSlot } from './slots';

/** The latest day any porada may be held on from `today`: the Thursday after the calendar's last Monday. */
const horizon = (today: CalDate): CalDate => addDays(lastSlotMonday(today), 3);

const meetsOn = (slots: readonly IssueSlot[], date: CalDate, except?: IssueSlot) =>
  slots.some((s) => s !== except && isSameDate(s.meetingDate, date));

// ---- move ----

/** Why a porada cannot be moved to a day (ADR 0054 item 3). */
export type MoveRefusal =
  'not-open' | 'early' | 'late' | 'same' | 'porada-exists' | 'deadline-past' | 'meeting-order';

export type MoveResult =
  | { readonly ok: true; readonly moved: IssueSlot }
  | { readonly ok: false; readonly refusal: MoveRefusal };

/**
 * The days `slot` may be moved to at `today` (a Prague date): from today, or the day after the
 * previous porada's meeting if later, to the day before the next porada's meeting or the horizon,
 * whichever is earlier. The date field offers exactly these days.
 */
export function moveBounds(
  slots: readonly IssueSlot[],
  slot: IssueSlot,
  today: CalDate,
): DateRange {
  const previous = slots.filter((s) => compareDates(s.monday, slot.monday) < 0).at(-1);
  const next = slots.find((s) => compareDates(s.monday, slot.monday) > 0);
  const after = previous ? addDays(previous.meetingDate, 1) : today;
  const before = next ? addDays(next.meetingDate, -1) : horizon(today);
  const limit = horizon(today);
  return {
    from: compareDates(after, today) < 0 ? today : after,
    to: compareDates(before, limit) > 0 ? limit : before,
  };
}

/**
 * Moves the open `slot` to `date` (ADR 0054 item 3): the Monday key stays, the meeting date and
 * the deadline (the rule's for the new day) change. Never into or past a neighbour; a move that
 * would close a hand-in still open is refused, and so is one that breaks the meeting order.
 * Pure: the use case and the dialogs both run it.
 */
export function planMove(
  slots: readonly IssueSlot[],
  slot: IssueSlot,
  date: CalDate,
  { rule, now }: { readonly rule: DeadlineRule; readonly now: Date },
): MoveResult {
  const refuse = (refusal: MoveRefusal): MoveResult => ({ ok: false, refusal });
  if (slot.status !== 'open') return refuse('not-open');
  if (isSameDate(date, slot.meetingDate)) return refuse('same');
  if (meetsOn(slots, date, slot)) return refuse('porada-exists');
  const bounds = moveBounds(slots, slot, instantToWallClock(now).date);
  if (compareDates(date, bounds.from) < 0) return refuse('early');
  if (compareDates(date, bounds.to) > 0) return refuse('late');
  const moved: IssueSlot = { ...slot, meetingDate: date, deadlineAt: deadline(date, rule) };
  if (moved.deadlineAt.getTime() <= now.getTime() && slot.deadlineAt.getTime() > now.getTime()) {
    return refuse('deadline-past');
  }
  if (orderConflicts(slots, moved).length > 0) return refuse('meeting-order');
  return { ok: true, moved };
}

// ---- drop ----

export type DropResult =
  | {
      readonly ok: true;
      /** The coming Mondays before the dropped porada with no row: they get rows, to stay poradas. */
      readonly fill: readonly IssueSlot[];
      /** The next porada after the dropped one, stored or virtual: it takes over its content. */
      readonly heir: IssueSlot;
      /** The value `calendar.plannedThrough` is written with: never lower than it was. */
      readonly plannedThrough: CalDate;
    }
  | { readonly ok: false; readonly refusal: 'not-open' };

/**
 * „Porada se nekoná“ for the open `slot` (ADR 0054 item 4). `plannedThrough` is the effective
 * boundary the slots were made with (null: none). Pure.
 */
export function planDrop(
  slots: readonly IssueSlot[],
  slot: IssueSlot,
  {
    rule,
    plannedThrough,
  }: { readonly rule: DeadlineRule; readonly plannedThrough: CalDate | null },
): DropResult {
  if (slot.status !== 'open') return { ok: false, refusal: 'not-open' };
  const fill = slots.filter((s) => !s.stored && compareDates(s.monday, slot.monday) < 0);
  const next = slots.find((s) => compareDates(s.monday, slot.monday) > 0);
  const monday = addDays(slot.monday, 7);
  const heir: IssueSlot = next ?? {
    monday,
    meetingDate: monday,
    deadlineAt: deadline(monday, rule),
    status: 'open',
    stored: false,
  };
  const keep =
    plannedThrough && compareDates(plannedThrough, heir.monday) > 0 ? plannedThrough : heir.monday;
  return { ok: true, fill, heir, plannedThrough: keep };
}

// ---- add ----

/** Why a porada cannot be added on a day (ADR 0054 item 5). */
export type AddRefusal = 'early' | 'late' | 'porada-exists' | 'later-generated' | 'meeting-order';

export type AddResult =
  | {
      readonly ok: true;
      readonly added: IssueSlot;
      /** The deadline has already passed: the dialog says so. */
      readonly closed: boolean;
    }
  | { readonly ok: false; readonly refusal: AddRefusal };

/**
 * A new porada held on `date`, keyed by `slotMondayOf(date)` (ADR 0054 item 5). Its Monday must have
 * no porada: a Monday after the boundary is one already (a virtual slot), so only a Monday up to
 * `plannedThrough` with no row is free. Pure.
 */
export function planAdd(
  slots: readonly IssueSlot[],
  date: CalDate,
  { rule, now }: { readonly rule: DeadlineRule; readonly now: Date },
): AddResult {
  const refuse = (refusal: AddRefusal): AddResult => ({ ok: false, refusal });
  const today = instantToWallClock(now).date;
  if (compareDates(date, today) < 0) return refuse('early');
  if (compareDates(date, horizon(today)) > 0) return refuse('late');
  const monday = slotMondayOf(date);
  if (slots.some((s) => isSameDate(s.monday, monday)) || meetsOn(slots, date)) {
    return refuse('porada-exists');
  }
  const added: IssueSlot = {
    monday,
    meetingDate: date,
    deadlineAt: deadline(date, rule),
    status: 'open',
    stored: true,
  };
  if (slots.some((s) => s.status === 'generated' && compareDates(s.monday, monday) > 0)) {
    return refuse('later-generated');
  }
  if (orderConflicts(slots, added).length > 0) return refuse('meeting-order');
  return { ok: true, added, closed: added.deadlineAt.getTime() <= now.getTime() };
}
