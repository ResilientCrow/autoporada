import {
  addDays,
  compareDates,
  instantToWallClock,
  isoWeekday,
  type CalDate,
  type WallTime,
} from '@/domain/time';

import { MONTH_GENITIVE, WEEKDAY_ACCUSATIVE, WEEKDAY_NOMINATIVE } from './tables';

const EN_DASH = '–';

/** The document writes times with a dot and no leading zero: „7.00“, „14.30“. */
const TIME_SEPARATOR = '.';

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

/** „16. 3.“ with a no-break space and no year — for lines about the next weeks. */
export function formatDayMonth(d: CalDate): string {
  return `${d.day}.\u00a0${d.month}.`;
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

/**
 * „27.–29. října 2026“, „30. října – 2. listopadu 2026“, „30. prosince 2026 – 2. ledna 2027“;
 * with `joiner: 'až'` (agenda bullets): „27. až 29. října 2026“.
 */
export function formatLongRange(
  from: CalDate,
  to: CalDate,
  { joiner = 'dash' }: { joiner?: 'dash' | 'až' } = {},
): string {
  assertOrdered(from, to);
  if (compareDates(from, to) === 0) return formatLongDate(from);
  // The dash is unspaced between bare day numbers; „až“ is always a word.
  const spaced = joiner === 'až' ? ' až ' : ` ${EN_DASH} `;
  const tight = joiner === 'až' ? ' až ' : EN_DASH;
  if (from.year !== to.year) return `${formatLongDate(from)}${spaced}${formatLongDate(to)}`;
  if (from.month !== to.month)
    return `${from.day}. ${monthGenitive(from)}${spaced}${formatLongDate(to)}`;
  return `${from.day}.${tight}${formatLongDate(to)}`;
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

/** „7.00“, „14.30“: the document's times. */
function formatTime(t: WallTime): string {
  return `${t.hour}${TIME_SEPARATOR}${pad2(t.minute)}`;
}

/** „7:00“, „23:59“: screens and mails write times with a colon and no leading zero. */
export function formatClock(t: WallTime): string {
  return `${t.hour}:${pad2(t.minute)}`;
}

/**
 * A close as screens and mails print it: the Prague day and „23:59“. A late report's close is capped
 * at 00:00 of the meeting day (ADR 0035), which would read as the meeting day itself, so 00:00 is
 * printed as the last minute of the day before.
 */
export function formatClose(due: Date): { readonly date: CalDate; readonly time: string } {
  const { date, time } = instantToWallClock(due);
  if (time.hour !== 0 || time.minute !== 0) return { date, time: formatClock(time) };
  return { date: addDays(date, -1), time: '23:59' };
}

/** „7.00 až 14.00 hodin“ or „8.00 hodin“ — agenda bullets (points 1 and 2). */
export function formatAgendaTimeRange(from: WallTime, to?: WallTime): string {
  return to ? `${formatTime(from)} až ${formatTime(to)} hodin` : `${formatTime(from)} hodin`;
}

/** „od 10.00 do 12.00 hodin“ or „od 10.00 hodin“ — report prose. */
export function formatProseTimeRange(from: WallTime, to?: WallTime): string {
  return to ? `od ${formatTime(from)} do ${formatTime(to)} hodin` : `od ${formatTime(from)} hodin`;
}

/** „2026/2027“ — a school year starts on 1 September. */
export function schoolYear(d: CalDate): string {
  const first = d.month >= 9 ? d.year : d.year - 1;
  return `${first}/${first + 1}`;
}
