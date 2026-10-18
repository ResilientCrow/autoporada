/**
 * A calendar date as people in Prague read it: no time and no zone. All
 * arithmetic runs on whole days, so daylight-saving changes cannot shift it.
 */
export interface CalDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

/** 1 = Monday … 7 = Sunday (ISO 8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calDate(year: number, month: number, day: number): CalDate {
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1900 &&
    year <= 9999;
  const probe = valid ? new Date(Date.UTC(year, month - 1, day)) : undefined;
  if (
    !probe ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a calendar date: ${year}-${month}-${day}`);
  }
  return Object.freeze({ year, month, day });
}

/** Parses `YYYY-MM-DD`; throws on anything else. */
export function parseIsoDate(text: string): CalDate {
  const match = ISO_DATE.exec(text);
  if (!match) throw new RangeError(`Not an ISO date: ${text}`);
  return calDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function toIsoDate(d: CalDate): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
}

/** Days since 1970-01-01. */
export function dayNumber(d: CalDate): number {
  return Date.UTC(d.year, d.month - 1, d.day) / DAY_MS;
}

export function fromDayNumber(n: number): CalDate {
  const date = new Date(n * DAY_MS);
  return calDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(d: CalDate, days: number): CalDate {
  return fromDayNumber(dayNumber(d) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: CalDate, to: CalDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function compareDates(a: CalDate, b: CalDate): number {
  return Math.sign(dayNumber(a) - dayNumber(b));
}

export function isSameDate(a: CalDate, b: CalDate): boolean {
  return compareDates(a, b) === 0;
}

export function isoWeekday(d: CalDate): IsoWeekday {
  // 1970-01-01 was a Thursday (ISO 4).
  return (((((dayNumber(d) + 3) % 7) + 7) % 7) + 1) as IsoWeekday;
}

/** The Monday of the ISO week containing `d`. */
export function mondayOf(d: CalDate): CalDate {
  return addDays(d, 1 - isoWeekday(d));
}
