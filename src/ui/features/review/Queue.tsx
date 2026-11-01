import type { ReactNode } from 'react';

import { QUEUE_LIMIT } from '@/contracts';
import { formatDayMonth } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import { instantToWallClock, parseIsoDate } from '@/domain/time';
import { points, review } from '@/ui/copy';
import { ItemLink, SlantLabel } from '@/ui/kit';

/** A handed-in point as the queue lists it; dates are ISO, the page writes them out. */
interface QueueRow {
  readonly id: string;
  readonly kind: PointKind;
  readonly title: string;
  readonly typeName: string | null;
  /** ISO instant of the last hand-in. */
  readonly submittedAt: string;
  readonly returnedBefore: boolean;
}

/** What /kontrola hands the screen: `points.queue` as it answers. */
interface QueueModel {
  readonly mondays: readonly {
    /** ISO Monday, or null when no Monday of the window takes the points. */
    readonly monday: string | null;
    /** The day that porada is held; null with `monday`. */
    readonly meetingDate: string | null;
    readonly kinds: readonly { readonly kind: PointKind; readonly points: readonly QueueRow[] }[];
  }[];
  readonly approved: readonly (QueueRow & {
    readonly monday: string | null;
    readonly meetingDate: string | null;
  })[];
  /** More points wait than the queue lists. */
  readonly more: boolean;
}

const dayMonth = (iso: string) => formatDayMonth(parseIsoDate(iso));

function Row({ row, children }: { readonly row: QueueRow; readonly children?: ReactNode }) {
  return (
    <li className="space-y-1">
      <p>
        <ItemLink href={`/kontrola/${row.id}`}>
          {row.title === '' ? points.untitled : row.title}
        </ItemLink>
      </p>
      <p>
        {row.typeName === null ? null : <>{row.typeName} · </>}
        {review.submitted(formatDayMonth(instantToWallClock(new Date(row.submittedAt)).date))}
        {row.returnedBefore ? <> · {review.returnedBefore}</> : null}
      </p>
      {children}
    </li>
  );
}

function Monday({ meetingDate, kinds }: QueueModel['mondays'][number]) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl">
        {meetingDate === null ? review.unplaced : review.porada(dayMonth(meetingDate))}
      </h2>
      {kinds.map(({ kind, points: rows }) => (
        <section key={kind} className="space-y-2">
          <h3 className="text-lg">{review.kind[kind]}</h3>
          <ul className="space-y-3">
            {rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

/**
 * „Schválení bodů“ (design section 10): the handed-in points by the porada they go to, then by
 * kind, the oldest hand-in first; the approved points still waiting for a porada apart, below.
 * The akce and jednání have a page of their own (`QueueFuture`).
 */
export function Queue({ queue }: { readonly queue: QueueModel }) {
  return (
    <div className="space-y-4">
      <SlantLabel level={1}>{review.title}</SlantLabel>
      {queue.more ? <p>{review.capped(QUEUE_LIMIT)}</p> : null}
      {queue.mondays.length === 0 ? <p>{review.empty}</p> : null}
      {queue.mondays.map((group) => (
        <Monday key={String(group.monday)} {...group} />
      ))}
      {queue.approved.length === 0 ? null : (
        <section className="space-y-3">
          <h2 className="text-xl">{review.approved}</h2>
          <ul className="space-y-3">
            {queue.approved.map((row) => (
              <Row key={row.id} row={row}>
                <p>
                  {row.meetingDate === null
                    ? review.unplaced
                    : points.mine.placement(dayMonth(row.meetingDate))}
                </p>
              </Row>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
