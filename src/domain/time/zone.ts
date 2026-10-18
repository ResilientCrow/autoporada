import { calDate, type CalDate } from './cal-date';
import { wallTime, type WallTime } from './wall-time';

/** The school's time zone. Every wall-clock value in the app means Prague time. */
export const PRAGUE = 'Europe/Prague';

const MINUTE_MS = 60_000;
const HALF_DAY_MS = 12 * 60 * MINUTE_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function fieldsAt(zone: string, ms: number): Fields {
  const fields: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  return fields as unknown as Fields;
}

/** UTC offset of `zone` at the instant `ms`, in minutes (Prague: 60 or 120). */
function offsetAt(zone: string, ms: number): number {
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  const f = fieldsAt(zone, wholeSecond);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - wholeSecond) / MINUTE_MS);
}

/**
 * The instant at which Prague clocks show `date` `time`.
 * - In the spring-forward gap (02:00–03:00 does not exist) the time moves
 *   forward by the gap: 02:30 becomes 03:30 summer time.
 * - In the autumn overlap (02:00–03:00 happens twice) the earlier, summer-time
 *   occurrence is used.
 */
export function wallClockToInstant(date: CalDate, time: WallTime, zone = PRAGUE): Date {
  const local = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  const before = offsetAt(zone, local - HALF_DAY_MS);
  const after = offsetAt(zone, local + HALF_DAY_MS);
  for (const offset of [...new Set([before, after])].sort((a, b) => b - a)) {
    const instant = local - offset * MINUTE_MS;
    if (offsetAt(zone, instant) === offset) return new Date(instant);
  }
  return new Date(local - before * MINUTE_MS);
}

/** What Prague clocks show at `instant` (seconds are dropped). */
export function instantToWallClock(
  instant: Date,
  zone = PRAGUE,
): { date: CalDate; time: WallTime } {
  const f = fieldsAt(zone, instant.getTime());
  return { date: calDate(f.year, f.month, f.day), time: wallTime(f.hour, f.minute) };
}
