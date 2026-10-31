import type { z } from 'zod';

import type { getFutureOutput } from '@/contracts';
import { formatClock, formatNumericDate, formatNumericRange, responsibleVerb } from '@/domain/cs';
import { compareDates, parseIsoDate, parseWallTime } from '@/domain/time';
import { points } from '@/ui/copy';

/** An item as a reader who is not (only) its author sees it: names only. */
export type FutureView = z.output<typeof getFutureOutput>['view'];

type When = Pick<FutureView, 'startDate' | 'endDate' | 'timeFrom' | 'timeTo'>;

/**
 * „10.–12. 11. 2026, 8:00 až 10:30 hodin“: the days and, when it starts at a time, the hours. Null
 * before the item has a start date. An end date before the start (a draft's) is left out.
 */
export function whenText({ startDate, endDate, timeFrom, timeTo }: When): string | null {
  if (startDate === null) return null;
  const start = parseIsoDate(startDate);
  const end = endDate === null ? null : parseIsoDate(endDate);
  const days =
    end !== null && compareDates(end, start) > 0
      ? formatNumericRange(start, end)
      : formatNumericDate(start);
  if (timeFrom === null) return days;
  const from = formatClock(parseWallTime(timeFrom));
  const hours = timeTo === null ? from : `${from} až ${formatClock(parseWallTime(timeTo))}`;
  return `${days}, ${hours} hodin`;
}

/** „za 8.A koordinuje Jana Nováková“; null where no one is named. */
export function responsibleText({ responsible }: Pick<FutureView, 'responsible'>): string | null {
  if (responsible === null || responsible.names.length === 0) return null;
  const { verb, behalfOf, names } = responsible;
  const who = `${responsibleVerb(verb, names.length)} ${names.join(', ')}`;
  return behalfOf === null ? who : `za ${behalfOf} ${who}`;
}

/** „Šmíchov, v učebně S206“; null where neither is set. */
export function campusAndPlace({
  campus,
  place,
}: Pick<FutureView, 'campus' | 'place'>): string | null {
  const parts = [campus && points.campus[campus], place?.trim()].filter((part) => part);
  return parts.length === 0 ? null : parts.join(', ');
}
