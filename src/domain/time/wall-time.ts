/** A time of day on a wall clock, minute precision. */
export interface WallTime {
  /** 0–23 */
  readonly hour: number;
  /** 0–59 */
  readonly minute: number;
}

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function wallTime(hour: number, minute: number): WallTime {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new RangeError(`Not a wall-clock time: ${hour}:${minute}`);
  }
  return Object.freeze({ hour, minute });
}

/** Parses `H:MM` or `HH:MM` (24-hour). */
export function parseWallTime(text: string): WallTime {
  const match = HH_MM.exec(text);
  if (!match) throw new RangeError(`Not a time: ${text}`);
  return wallTime(Number(match[1]), Number(match[2]));
}

/** `HH:MM`, as parseWallTime reads it back. */
export function toIsoTime(t: WallTime): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

export function minutesOfDay(t: WallTime): number {
  return t.hour * 60 + t.minute;
}

export function compareTimes(a: WallTime, b: WallTime): number {
  return Math.sign(minutesOfDay(a) - minutesOfDay(b));
}
