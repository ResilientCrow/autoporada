import Link from 'next/link';

import { QUEUE_LIMIT } from '@/contracts';
import { formatDayMonth, formatNumericDate, formatNumericRange } from '@/domain/cs';
import type { FutureKind } from '@/domain/calendar';
import { compareDates, instantToWallClock, parseIsoDate } from '@/domain/time';
import { future, points, review } from '@/ui/copy';

/** A handed-in akce or jednání as the queue lists it; dates are ISO, the page writes them out. */
interface QueueFutureRow {
  readonly id: string;
  readonly kind: FutureKind;
  readonly title: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** ISO instant of the last hand-in. */
  readonly submittedAt: string;
  /** An approved akce its author changed. */
  readonly revised: boolean;
}

/** What `future.queue` answers. */
export interface QueueFutureModel {
  readonly items: readonly QueueFutureRow[];
  /** More items wait than the section lists. */
  readonly more: boolean;
}

/** „10.–12. 11. 2026“: the days an item takes, or null before it has a start date. */
function days({ startDate, endDate }: QueueFutureRow): string | null {
  if (startDate === null) return null;
  const start = parseIsoDate(startDate);
  const end = endDate === null ? null : parseIsoDate(endDate);
  return end !== null && compareDates(end, start) > 0
    ? formatNumericRange(start, end)
    : formatNumericDate(start);
}

/**
 * The akce and jednání of the queue (design section 12): a flat list, the oldest hand-in first,
 * each linking to its page, where the reviewer decides. An approved akce its author changed
 * carries „Změna schválené akce“. Left out when none waits.
 */
export function QueueFuture({ future: waiting }: { readonly future: QueueFutureModel }) {
  if (waiting.items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xl">{review.future.title}</h2>
      {waiting.more ? <p>{review.future.capped(QUEUE_LIMIT)}</p> : null}
      <ul className="space-y-3">
        {waiting.items.map((row) => (
          <li key={row.id} className="space-y-1">
            <p>
              <Link href={`/akce/${row.id}`} prefetch={false} className="font-bold">
                {row.title === '' ? points.untitled : row.title}
              </Link>
            </p>
            <p>
              {future.kind[row.kind]}
              {days(row) === null ? null : <> · {days(row)}</>}
              {' · '}
              {review.submitted(formatDayMonth(instantToWallClock(new Date(row.submittedAt)).date))}
              {row.revised ? <> · {review.future.revised}</> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
