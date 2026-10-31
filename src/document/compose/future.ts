import { routeFutureItem } from '@/domain/calendar';
import {
  csCollator,
  formatAgendaTimeRange,
  formatLongRange,
  formatTitleDate,
  renderPeople,
  responsibleVerb,
  type Salutation,
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
export function routeFuture(items: readonly SnapshotFutureItem[], meeting: CalDate): RoutedFuture {
  const sorted = [...items].sort(compareFuture);
  const slot = (item: SnapshotFutureItem) => routeFutureItem(dated(item), meeting);
  return {
    meetings: sorted.filter((i) => slot(i) === 'meetings'),
    events: sorted.filter((i) => slot(i) === 'events'),
    later: sorted.filter((i) => slot(i) === 'later'),
  };
}

/** „za Next Zone Event Space koordinuje absolvent pan Jan Novák“, or nothing. */
function responsiblePart(
  item: SnapshotFutureItem,
  groupOrder?: readonly Salutation[],
): string | undefined {
  const r = item.responsible;
  if (!r) return undefined;
  const people = renderPeople(r.people, {
    join: 'and',
    order: 'input',
    ...(groupOrder && { groupOrder }),
  });
  return [r.behalfOf && `za ${r.behalfOf}`, responsibleVerb(r.verb, r.people.length), people]
    .filter(Boolean)
    .join(' ');
}

/**
 * The headmaster's agenda format, every part after the date optional:
 * „úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event
 * Space, akce Vaib, za Next Zone Event Space koordinuje absolvent pan Jan
 * Novák“. Multi-day items: „20. až 22. října 2026, …“, no times.
 */
export function futureBullet(item: SnapshotFutureItem, groupOrder?: readonly Salutation[]): Block {
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
    multiDay ? formatLongRange(start, end, { joiner: 'až' }) : formatTitleDate(start),
    time,
    item.campus && CAMPUS_LABEL[item.campus],
    item.place,
    item.title,
    responsiblePart(item, groupOrder),
  ];
  return { kind: 'bullet', runs: [{ text: finalText(parts.filter(Boolean).join(', ')) }] };
}
