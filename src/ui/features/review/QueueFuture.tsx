import { QUEUE_LIMIT } from '@/contracts';
import { formatDayMonth, formatNumericDate, formatNumericRange } from '@/domain/cs';
import type { FutureKind } from '@/domain/calendar';
import { compareDates, instantToWallClock, parseIsoDate } from '@/domain/time';
import { future, points, review } from '@/ui/copy';
import { ItemLink, SlantLabel } from '@/ui/kit';

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
  /** ISO instant the author asked to cancel this approved item; null when no request waits. */
  readonly cancelRequestedAt: string | null;
}

/** What `future.queue` answers. */
const dayOf = (instant: string) => formatDayMonth(instantToWallClock(new Date(instant)).date);

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
 * „Schválení budoucích akcí“ (/kontrola/akce, design section 12): the handed-in akce and jednání
 * in a flat list, the oldest hand-in first, each linking to its page, where the reviewer decides.
 * An approved akce its author changed carries „Změna schválené akce“, one whose author asked to cancel it „Žádost o zrušení“.
 */
export function QueueFuture({ future: waiting }: { readonly future: QueueFutureModel }) {
  return (
    <div className="space-y-4">
      <SlantLabel level={1}>{review.future.title}</SlantLabel>
      {waiting.more ? <p>{review.future.capped(QUEUE_LIMIT)}</p> : null}
      {waiting.items.length === 0 ? <p>{review.future.empty}</p> : null}
      <ul className="space-y-3">
        {waiting.items.map((row) => (
          <li key={row.id} className="space-y-1">
            <p>
              <ItemLink href={`/akce/${row.id}`}>
                {row.title === '' ? points.untitled : row.title}
              </ItemLink>
            </p>
            <p>
              {future.kind[row.kind]}
              {days(row) === null ? null : <> · {days(row)}</>}
              {' · '}
              {row.cancelRequestedAt === null ? (
                <>
                  {review.submitted(dayOf(row.submittedAt))}
                  {row.revised ? <> · {review.future.revised}</> : null}
                </>
              ) : (
                review.future.cancelRequestedOn(dayOf(row.cancelRequestedAt))
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
