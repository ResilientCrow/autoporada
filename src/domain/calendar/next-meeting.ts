import {
  addDays,
  compareDates,
  instantToWallClock,
  isSameDate,
  mondayOf,
  type CalDate,
} from '@/domain/time';

import { deadline, type DateRange, type DeadlineRule } from './issue-calendar';
import { orderConflicts } from './order';
import { lastSlotMonday, type IssueSlot } from './slots';

/** Why a day cannot be the next porada's (ADR 0051). */
export type NextMeetingRefusal =
  'early' | 'late' | 'same' | 'skipped' | 'deadline-past' | 'meeting-order';

/** What „Porada se nekoná“ with the next porada on a chosen day does to the calendar. */
export interface NextMeetingPlan {
  /** The slot held next, as it will be: on the chosen day, with its deadline. */
  readonly held: IssueSlot;
  /** The chosen day is not the meeting date the held slot had: it gets the rule's deadline for it. */
  readonly moved: boolean;
  /** The open slots that stop taking place, in Monday order, the skipped one first; none when it is the one held. */
  readonly skipped: readonly IssueSlot[];
}

export type NextMeetingResult =
  | { readonly ok: true; readonly plan: NextMeetingPlan }
  | { readonly ok: false; readonly refusal: NextMeetingRefusal };

/** The slot a day belongs to: the nearest Monday, so Monday to Thursday keep theirs and Friday to Sunday take the next one. */
export const slotMondayOf = (date: CalDate): CalDate => mondayOf(addDays(date, 3));

/**
 * The days the next porada after the one of `monday` may be held on, at `today` (a Prague date):
 * from the Friday before that Monday (an earlier day belongs to an earlier porada), or today if
 * later, to the Thursday after the calendar's last Monday (a later day belongs to no slot).
 */
export function nextMeetingBounds(monday: CalDate, today: CalDate): DateRange {
  const friday = addDays(monday, -3);
  return {
    from: compareDates(friday, today) < 0 ? today : friday,
    to: addDays(lastSlotMonday(today), 3),
  };
}

const refuse = (refusal: NextMeetingRefusal): NextMeetingResult => ({ ok: false, refusal });

/**
 * „Porada se nekoná“ for the open slot `from`, the next porada held on `date` (ADR 0051). The
 * day's slot (`slotMondayOf`) is `from` itself, which is then moved to that day, or a later one
 * that takes place: `from` and every open slot before it are skipped, and it is moved when the
 * day is not its meeting date. A moved slot gets the deadline `rule` counts back from the day; a
 * move that would close a hand-in still open is refused, and so is one that breaks the meeting
 * order against the slots left (ADR 0034). Pure: the use case and the dialog both run it.
 */
export function planNextMeeting(
  slots: readonly IssueSlot[],
  from: IssueSlot,
  date: CalDate,
  { rule, now }: { readonly rule: DeadlineRule; readonly now: Date },
): NextMeetingResult {
  const bounds = nextMeetingBounds(from.monday, instantToWallClock(now).date);
  if (compareDates(date, bounds.from) < 0) return refuse('early');
  if (compareDates(date, bounds.to) > 0) return refuse('late');
  const monday = slotMondayOf(date);
  const slot = slots.find((s) => isSameDate(s.monday, monday));
  if (!slot) return refuse('late');
  const self = isSameDate(slot.monday, from.monday);
  if (self && isSameDate(date, from.meetingDate)) return refuse('same');
  if (!self && slot.status !== 'open') return refuse('skipped');

  const skipped = self
    ? []
    : slots.filter(
        (s) =>
          s.status === 'open' &&
          compareDates(s.monday, from.monday) >= 0 &&
          compareDates(s.monday, slot.monday) < 0,
      );
  if (isSameDate(date, slot.meetingDate)) {
    return { ok: true, plan: { held: slot, moved: false, skipped } };
  }
  const held = { ...slot, meetingDate: date, deadlineAt: deadline(date, rule) };
  const closesNow = held.deadlineAt.getTime() <= now.getTime();
  if (closesNow && slot.deadlineAt.getTime() > now.getTime()) return refuse('deadline-past');
  const left = slots.map((s) => (skipped.includes(s) ? { ...s, status: 'skipped' as const } : s));
  if (orderConflicts(left, held).length > 0) return refuse('meeting-order');
  return { ok: true, plan: { held, moved: true, skipped } };
}
