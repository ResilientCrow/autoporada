import {
  addDays,
  compareDates,
  instantToWallClock,
  isoWeekday,
  mondayOf,
  parseWallTime,
  wallClockToInstant,
  type CalDate,
  type WallTime,
} from '@/domain/time';

/** When submissions for the issue of Monday M close: M + dayOffset at `time`, Prague time. */
export interface DeadlineRule {
  /** Days relative to the meeting Monday; -1 = the Sunday before. */
  readonly dayOffset: number;
  readonly time: WallTime;
}

export const DEFAULT_DEADLINE: DeadlineRule = { dayOffset: -1, time: parseWallTime('18:00') };

export function assertMonday(monday: CalDate): void {
  if (isoWeekday(monday) !== 1) throw new RangeError('An issue belongs to a Monday');
}

export function deadline(monday: CalDate, rule: DeadlineRule = DEFAULT_DEADLINE): Date {
  assertMonday(monday);
  return wallClockToInstant(addDays(monday, rule.dayOffset), rule.time);
}

/**
 * The issue a submission made at `now` goes into: the first Monday whose
 * deadline is still ahead. Fixed at first submit, so a returned and
 * resubmitted point keeps its place (plan §5, `earliest_monday`).
 */
export function targetMonday(now: Date, rule: DeadlineRule = DEFAULT_DEADLINE): CalDate {
  if (rule.dayOffset > 0) throw new RangeError('A deadline cannot fall after the meeting');
  const start = mondayOf(instantToWallClock(now).date);
  for (let week = 0; ; week++) {
    const monday = addDays(start, 7 * week);
    if (now.getTime() < deadline(monday, rule).getTime()) return monday;
  }
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

/** Point 1: „Zatím známá jednání v týdnu od M do M+7“ (both ends inclusive). */
export function meetingsWindow(monday: CalDate): DateRange {
  return { from: monday, to: addDays(monday, 7) };
}

/** Point 2: „Zatím známé akce v týdnech od M do M+14“. */
export function eventsWindow(monday: CalDate): DateRange {
  return { from: monday, to: addDays(monday, 14) };
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
 * Where an approved future item appears in the issue of `monday`:
 * - jednání overlapping the meeting week → point 1;
 * - akce overlapping the next two weeks → point 2;
 * - later akce → the last PROVOZ point, „Další doposud známé akce školy“;
 * - finished items, and jednání beyond the week, are not listed (yet).
 * Items therefore move up week by week without anyone touching them.
 */
export function routeFutureItem(
  item: Dated & { readonly kind: FutureKind },
  monday: CalDate,
): FutureSlot {
  if (compareDates(lastDay(item), monday) < 0) return 'hidden';
  if (item.kind === 'jednani')
    return overlaps(item, meetingsWindow(monday)) ? 'meetings' : 'hidden';
  if (overlaps(item, eventsWindow(monday))) return 'events';
  return 'later';
}

/** A report belongs in an issue only once its event is over before the meeting day. */
export function eventEndedBefore(item: Dated, monday: CalDate): boolean {
  return compareDates(lastDay(item), monday) < 0;
}
