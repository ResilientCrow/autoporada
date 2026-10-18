import { routeFutureItem } from '@/domain/calendar';
import {
  csCollator,
  formatBulletTimeRange,
  formatNumericRange,
  formatWeekdayNumeric,
} from '@/domain/cs';
import { compareDates, parseIsoDate, parseWallTime, type CalDate } from '@/domain/time';
import type { SnapshotFutureItem } from '@/snapshot';

import type { Block } from '../model';
import { finalText } from './text';

const CAMPUS_LABEL: Readonly<Record<string, string>> = {
  smichov: 'areál Smíchov',
  radlice: 'areál Radlice',
  'na-vidouli': 'areál Na Vidouli',
};

export interface RoutedFuture {
  readonly meetings: readonly SnapshotFutureItem[];
  readonly events: readonly SnapshotFutureItem[];
  readonly later: readonly SnapshotFutureItem[];
}

const dated = (item: SnapshotFutureItem) => ({
  kind: item.kind,
  date: parseIsoDate(item.date),
  ...(item.endDate && { endDate: parseIsoDate(item.endDate) }),
});

/** Chronological: date, then start time (all-day first), then title. */
function compareFuture(a: SnapshotFutureItem, b: SnapshotFutureItem): number {
  const minutes = (t?: string) => (t ? parseWallTime(t).hour * 60 + parseWallTime(t).minute : -1);
  return (
    compareDates(parseIsoDate(a.date), parseIsoDate(b.date)) ||
    minutes(a.timeFrom) - minutes(b.timeFrom) ||
    csCollator.compare(a.title, b.title)
  );
}

/** Splits approved future items into points 1 and 2 and the last PROVOZ point. */
export function routeFuture(items: readonly SnapshotFutureItem[], monday: CalDate): RoutedFuture {
  const sorted = [...items].sort(compareFuture);
  const slot = (item: SnapshotFutureItem) => routeFutureItem(dated(item), monday);
  return {
    meetings: sorted.filter((i) => slot(i) === 'meetings'),
    events: sorted.filter((i) => slot(i) === 'events'),
    later: sorted.filter((i) => slot(i) === 'later'),
  };
}

/**
 * „pondělí 19. 10. 2026, 10:00–11:00 – jednání s MČ Praha 5 (ředitelna, Preslova)“
 * „27.–29. 10. 2026 – exkurze 2.B do CERNu“
 */
export function futureBullet(item: SnapshotFutureItem): Block {
  const start = parseIsoDate(item.date);
  const end = item.endDate ? parseIsoDate(item.endDate) : undefined;
  const multiDay = end && compareDates(start, end) < 0;
  const when = multiDay ? formatNumericRange(start, end) : formatWeekdayNumeric(start);
  const time =
    !multiDay && item.timeFrom
      ? `, ${formatBulletTimeRange(parseWallTime(item.timeFrom), item.timeTo ? parseWallTime(item.timeTo) : undefined)}`
      : '';
  const where = [item.place, item.campus && CAMPUS_LABEL[item.campus]].filter(Boolean).join(', ');
  const text = `${when}${time} – ${item.title}${where ? ` (${where})` : ''}`;
  return { kind: 'bullet', runs: [{ text: finalText(text) }] };
}
