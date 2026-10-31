import {
  addDays,
  compareDates,
  isoWeekday,
  parseWallTime,
  wallClockToInstant,
  type CalDate,
  type WallTime,
} from '@/domain/time';

/** When hand-in for a porada closes: its meeting date + dayOffset at `time`, Prague time. */
export interface DeadlineRule {
  /** Days relative to the meeting date; -2 = two days before (the Saturday before a Monday). */
  readonly dayOffset: number;
  readonly time: WallTime;
}

/** Saturday 20.00 for a Monday meeting. */
export const DEFAULT_DEADLINE: DeadlineRule = { dayOffset: -2, time: parseWallTime('20:00') };

export function assertMonday(monday: CalDate): void {
  if (isoWeekday(monday) !== 1) throw new RangeError('An issue belongs to a Monday');
}

/** The deadline of a porada held on `meetingDate`, which need not be a Monday. */
export function deadline(meetingDate: CalDate, rule: DeadlineRule = DEFAULT_DEADLINE): Date {
  return wallClockToInstant(addDays(meetingDate, rule.dayOffset), rule.time);
}

export type IssuePhase = 'collecting' | 'review';

/** Before the deadline people submit; after it reviewers and the headmaster finish the issue. */
export function issuePhase(now: Date, deadlineAt: Date): IssuePhase {
  return now.getTime() < deadlineAt.getTime() ? 'collecting' : 'review';
}

export interface DateRange {
  readonly from: CalDate;
  readonly to: CalDate;
}

/** Point 1: „Zatím známá jednání v týdnu od M do M+7“, M the meeting date (both ends inclusive). */
export function meetingsWindow(meeting: CalDate): DateRange {
  return { from: meeting, to: addDays(meeting, 7) };
}

/** Point 2: „Zatím známé akce v týdnech od M do M+14“, M the meeting date. */
export function eventsWindow(meeting: CalDate): DateRange {
  return { from: meeting, to: addDays(meeting, 14) };
}

export interface Dated {
  readonly date: CalDate;
  /** Last day of a multi-day item; the single day otherwise. */
  readonly endDate?: CalDate;
}

/** The item's last day; a range that ends before it starts is a bug upstream. */
function lastDay(item: Dated): CalDate {
  if (item.endDate && compareDates(item.endDate, item.date) < 0) {
    throw new RangeError('Date range ends before it starts');
  }
  return item.endDate ?? item.date;
}

function overlaps(item: Dated, range: DateRange): boolean {
  return compareDates(item.date, range.to) <= 0 && compareDates(lastDay(item), range.from) >= 0;
}

export type FutureKind = 'jednani' | 'akce';
export type FutureSlot = 'meetings' | 'events' | 'later' | 'hidden';

/**
 * Where an approved future item appears in the issue whose meeting is on `meeting`:
 * - jednání overlapping the week from the meeting date → point 1;
 * - akce overlapping the next two weeks → point 2;
 * - later akce → the last PROVOZ point, „Další doposud známé akce školy“;
 * - finished items, and jednání beyond the week, are not listed (yet).
 * Items therefore move up week by week without anyone touching them.
 */
export function routeFutureItem(
  item: Dated & { readonly kind: FutureKind },
  meeting: CalDate,
): FutureSlot {
  if (compareDates(lastDay(item), meeting) < 0) return 'hidden';
  if (item.kind === 'jednani')
    return overlaps(item, meetingsWindow(meeting)) ? 'meetings' : 'hidden';
  if (overlaps(item, eventsWindow(meeting))) return 'events';
  return 'later';
}

/** A report belongs in an issue only once its event is over before the meeting day. */
export function eventEndedBefore(item: Dated, meeting: CalDate): boolean {
  return compareDates(lastDay(item), meeting) < 0;
}
