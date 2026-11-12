import { routeFutureItem } from '@/domain/calendar';
import { csCollator, formatAgendaTimeRange, formatAgendaDays, formatTitleDate } from '@/domain/cs';
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

/**
 * Start day; on one start day the multi-day items first, then the timed ones by start time, then
 * the untimed ones; then title (ADR 0060).
 */
function compareFuture(a: SnapshotFutureItem, b: SnapshotFutureItem): number {
  const multiDay = (i: SnapshotFutureItem) => (i.endDate && i.endDate > i.date ? 0 : 1);
  const minutes = (t?: string) =>
    t ? parseWallTime(t).hour * 60 + parseWallTime(t).minute : Number.MAX_SAFE_INTEGER;
  return (
    compareDates(parseIsoDate(a.date), parseIsoDate(b.date)) ||
    multiDay(a) - multiDay(b) ||
    minutes(a.timeFrom) - minutes(b.timeFrom) ||
    csCollator.compare(a.title, b.title)
  );
}

/** Splits approved future items into points 1 and 2 and the last PROVOZ point. */
export function routeFuture(items: readonly SnapshotFutureItem[], meeting: CalDate): RoutedFuture {
  const sorted = [...items].sort(compareFuture);
  const slot = (item: SnapshotFutureItem) => routeFutureItem(dated(item), meeting);
  return {
    meetings: sorted.filter((i) => slot(i) === 'meetings'),
    events: sorted.filter((i) => slot(i) === 'events'),
    later: sorted.filter((i) => slot(i) === 'later'),
  };
}

/**
 * The agenda line, every part after the date optional and empty parts left out (ADR 0060):
 * „úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib,
 * téma stáže, organizuje paní Jana Nováková, účast pánové …“. Multi-day items print the day
 * range and no time. The note, the organizer and the participants are the author's words.
 */
export function futureBullet(item: SnapshotFutureItem): Block {
  const start = parseIsoDate(item.date);
  const end = item.endDate ? parseIsoDate(item.endDate) : undefined;
  const multiDay = end !== undefined && compareDates(start, end) < 0;
  const time =
    !multiDay && item.timeFrom
      ? formatAgendaTimeRange(
          parseWallTime(item.timeFrom),
          item.timeTo ? parseWallTime(item.timeTo) : undefined,
        )
      : undefined;
  const parts = [
    multiDay ? formatAgendaDays(start, end) : formatTitleDate(start),
    time,
    item.campus && CAMPUS_LABEL[item.campus],
    item.place,
    item.title,
    item.note,
    item.organizer,
    item.participants,
  ];
  return { kind: 'bullet', runs: [{ text: finalText(parts.filter(Boolean).join(', ')) }] };
}
