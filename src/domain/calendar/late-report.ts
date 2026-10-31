import {
  compareDates,
  parseWallTime,
  wallClockToInstant,
  type CalDate,
  type WallTime,
} from '@/domain/time';

/** What a report's close depends on: the event's last day and, when known, when it ends that day. */
export interface LateFacts {
  readonly lastDay: CalDate;
  readonly timeTo: WallTime | null;
}

/** The part of a porada a report's close reads: where it is held and when hand-in closes. */
export interface PoradaClose {
  readonly meetingDate: CalDate;
  readonly deadlineAt: Date;
}

/** The grace after an event ends (absolute time, so a night the clocks change counts 2 h too). */
const LATE_GRACE_MS = 2 * 3_600_000;

const END_OF_EVENT_DEFAULT = parseWallTime('20:00');
const MIDNIGHT = parseWallTime('0:00');

/** Facts of the event a report is about; `undefined` while its date is missing. */
export function lateFacts(content: {
  readonly eventDate: CalDate | null;
  readonly endDate: CalDate | null;
  readonly timeTo: WallTime | null;
}): LateFacts | undefined {
  const { eventDate, endDate, timeTo } = content;
  if (eventDate === null) return undefined;
  const lastDay = endDate !== null && compareDates(endDate, eventDate) > 0 ? endDate : eventDate;
  return { lastDay, timeTo };
}

/** The last day at its end time, or at 20.00 without one (Prague time; ADR 0035). */
export const eventEnd = (report: LateFacts): Date =>
  wallClockToInstant(report.lastDay, report.timeTo ?? END_OF_EVENT_DEFAULT);

/**
 * When the report must be in for `porada`: its deadline, or for an event that ends before the
 * meeting day, the later of that and the event's end + 2 h, never after 00.00 of the meeting day
 * (ADR 0035, U3).
 */
export function reportCloses(porada: PoradaClose, report: LateFacts): Date {
  const { deadlineAt, meetingDate } = porada;
  if (compareDates(report.lastDay, meetingDate) >= 0) return deadlineAt;
  const cap = wallClockToInstant(meetingDate, MIDNIGHT).getTime();
  const due = Math.min(eventEnd(report).getTime() + LATE_GRACE_MS, cap);
  return new Date(Math.max(deadlineAt.getTime(), due));
}

/** A report is late for a porada when it may be handed in after the porada's own deadline. */
export const isLateReport = (porada: PoradaClose, report: LateFacts): boolean =>
  reportCloses(porada, report).getTime() > porada.deadlineAt.getTime();

const LAST_CALL_BEFORE_MS = 3_600_000;
const MAIL_ENDS_BEFORE_MS = 15 * 60_000;

/**
 * Whether a late report's mail is due now (ADR 0035 item 6). `ended` goes from the event's end
 * until the last call, or until 15 minutes before the close when no last call fits; `last-call`
 * goes from an hour before the close until 15 minutes before it, and only when that hour starts
 * after the event's end.
 */
export function lateMailDue(kind: 'ended' | 'last-call', end: Date, due: Date, now: Date): boolean {
  const at = now.getTime();
  const lastCall = due.getTime() - LAST_CALL_BEFORE_MS;
  const stop = due.getTime() - MAIL_ENDS_BEFORE_MS;
  const callFits = lastCall > end.getTime();
  if (kind === 'ended') return at >= end.getTime() && at < (callFits ? lastCall : stop);
  return callFits && at >= lastCall && at < stop;
}
