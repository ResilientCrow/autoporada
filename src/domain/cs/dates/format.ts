import { compareDates, isoWeekday, type CalDate, type WallTime } from '@/domain/time';

import { MONTH_GENITIVE, WEEKDAY_ACCUSATIVE, WEEKDAY_NOMINATIVE } from './tables';

const EN_DASH = '–';

/** Bullets use 10:00–11:00; prose uses „od 10.00 do 12.00 hodin“ (template house style). */
const BULLET_TIME_SEPARATOR = ':';
const PROSE_TIME_SEPARATOR = '.';

const weekdayIndex = (d: CalDate) => isoWeekday(d) - 1;
const monthGenitive = (d: CalDate) => MONTH_GENITIVE[d.month - 1] ?? '';

export function weekdayName(d: CalDate): string {
  return WEEKDAY_NOMINATIVE[weekdayIndex(d)] ?? '';
}

/** „12. října 2026“ */
export function formatLongDate(d: CalDate): string {
  return `${d.day}. ${monthGenitive(d)} ${d.year}`;
}

/** „pondělí 12. října 2026“ — the meeting title and the closing line. */
export function formatTitleDate(d: CalDate): string {
  return `${weekdayName(d)} ${formatLongDate(d)}`;
}

/** „19. 10. 2026“ */
export function formatNumericDate(d: CalDate): string {
  return `${d.day}. ${d.month}. ${d.year}`;
}

/** „pondělí 19. 10. 2026“ — future-item bullets. */
export function formatWeekdayNumeric(d: CalDate): string {
  return `${weekdayName(d)} ${formatNumericDate(d)}`;
}

/**
 * „v pondělí“, „ve středu“, „ve čtvrtek“ — the preposition is vocalised
 * before st- and čt-. Pass `capitalize` at the start of a sentence.
 */
export function onWeekday(d: CalDate, { capitalize = false } = {}): string {
  const accusative = WEEKDAY_ACCUSATIVE[weekdayIndex(d)] ?? '';
  const preposition = /^(st|čt)/.test(accusative) ? 've' : 'v';
  const phrase = `${preposition} ${accusative}`;
  return capitalize ? phrase[0]?.toUpperCase() + phrase.slice(1) : phrase;
}

function assertOrdered(from: CalDate, to: CalDate): void {
  if (compareDates(from, to) > 0) throw new RangeError('Date range ends before it starts');
}

/**
 * „27.–29. 10. 2026“, „30. 10. – 2. 11. 2026“, „30. 12. 2026 – 2. 1. 2027“.
 * The dash is spaced whenever either side contains a space.
 */
export function formatNumericRange(from: CalDate, to: CalDate): string {
  assertOrdered(from, to);
  if (compareDates(from, to) === 0) return formatNumericDate(from);
  if (from.year !== to.year)
    return `${formatNumericDate(from)} ${EN_DASH} ${formatNumericDate(to)}`;
  if (from.month !== to.month) {
    return `${from.day}. ${from.month}. ${EN_DASH} ${formatNumericDate(to)}`;
  }
  return `${from.day}.${EN_DASH}${formatNumericDate(to)}`;
}

/** „27.–29. října 2026“, „30. října – 2. listopadu 2026“, „30. prosince 2026 – 2. ledna 2027“ */
export function formatLongRange(from: CalDate, to: CalDate): string {
  assertOrdered(from, to);
  if (compareDates(from, to) === 0) return formatLongDate(from);
  if (from.year !== to.year) return `${formatLongDate(from)} ${EN_DASH} ${formatLongDate(to)}`;
  if (from.month !== to.month) {
    return `${from.day}. ${monthGenitive(from)} ${EN_DASH} ${formatLongDate(to)}`;
  }
  return `${from.day}.${EN_DASH}${formatLongDate(to)}`;
}

/**
 * „od 12. října do 19. října 2026“ — the month is repeated even within one
 * month, as in the template; the year appears once unless the range crosses it.
 */
export function formatWindow(from: CalDate, to: CalDate): string {
  assertOrdered(from, to);
  const start =
    from.year === to.year ? `${from.day}. ${monthGenitive(from)}` : formatLongDate(from);
  return `od ${start} do ${formatLongDate(to)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** „10:00“ — hours without a leading zero. */
export function formatBulletTime(t: WallTime): string {
  return `${t.hour}${BULLET_TIME_SEPARATOR}${pad2(t.minute)}`;
}

/** „10:00–11:00“ or „10:00“ */
export function formatBulletTimeRange(from: WallTime, to?: WallTime): string {
  return to ? `${formatBulletTime(from)}${EN_DASH}${formatBulletTime(to)}` : formatBulletTime(from);
}

/** „od 10.00 do 12.00 hodin“ or „od 10.00 hodin“ */
export function formatProseTimeRange(from: WallTime, to?: WallTime): string {
  const prose = (t: WallTime) => `${t.hour}${PROSE_TIME_SEPARATOR}${pad2(t.minute)}`;
  return to ? `od ${prose(from)} do ${prose(to)} hodin` : `od ${prose(from)} hodin`;
}

/** „2026/2027“ — a school year starts on 1 September. */
export function schoolYear(d: CalDate): string {
  const first = d.month >= 9 ? d.year : d.year - 1;
  return `${first}/${first + 1}`;
}
