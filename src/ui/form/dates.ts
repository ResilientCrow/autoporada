import { formatTitleDate } from '@/domain/cs';
import { parseIsoDate, parseWallTime, toIsoDate, toIsoTime } from '@/domain/time';

/**
 * A date or time the editor holds as text, read; none when there is none or the text is not
 * one (the parse's RangeError: a day that does not exist). Readiness reports what the save
 * would refuse, so the editor reads tolerantly.
 */
export function readText<T>(text: string | null, parse: (text: string) => T): T | null {
  if (text === null) return null;
  try {
    return parse(text);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function isDate(text: string): boolean {
  const date = readText(text, parseIsoDate);
  return date !== null && toIsoDate(date) === text;
}

function isTime(text: string): boolean {
  const time = readText(text, parseWallTime);
  return time !== null && toIsoTime(time) === text;
}

/**
 * What a date control reports as the new value of the field: nothing when cleared, the
 * ISO text when it is a date, and otherwise (a year of five digits, a day that does not
 * exist) the date the field already had, since the server refuses the whole save for it.
 */
export function pickedDate(value: string, current: string | null): string | null {
  if (value === '') return null;
  return isDate(value) ? value : current;
}

/**
 * A date control's change: what it shows from now on and what the content takes. The
 * control keeps the text as typed (Chromium reports a year key by key, `0002-01-14`,
 * `0020-01-14`, and a controlled field that took the old date back would undo each
 * digit); the content follows `pickedDate`.
 */
export function typedDate(
  raw: string,
  current: string | null,
): { readonly shown: string; readonly value: string | null } {
  return { shown: raw, value: pickedDate(raw, current) };
}

/** The same for a time control, which reports `HH:MM`. */
export function pickedTime(value: string, current: string | null): string | null {
  if (value === '') return null;
  return isTime(value) ? value : current;
}

/** „čtvrtek 14. ledna 2027“: the only Czech confirmation of a date the browser shows in its own format. */
export function dateEcho(value: string | null): string | null {
  return value !== null && isDate(value) ? formatTitleDate(parseIsoDate(value)) : null;
}
