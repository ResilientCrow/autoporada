import { and, asc, eq, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';

import type { PointRef, PointRepo, TxContext } from '@/application/ports';
import { toIsoDate } from '@/domain/time';

import { points } from '../schema';
import type { TxDatabase } from './database';
import { POINT_ROW, toRecord, visiblePoints } from './points-read';

/** The Monday a point is due for (`dueMonday`): the later of its fixed first Monday and its hand-in one. */
const dueMonday = sql`greatest(${points.earliestMonday}, ${points.handInMonday})`;

/** An event's last day: the end date, or else the day itself; null when a report has no event date. */
const lastDay = sql`coalesce(${points.endDate}, ${points.eventDate})`;

/** The order handed in, as `queue`: oldest submission first, ties to the lower id. */
const HANDED_IN_FIRST = [asc(points.submittedAt), asc(points.id)];

/**
 * What an issue reads of the points (design section 3): the SQL twin of `inIssue` in
 * domain/calendar, and what waits for the slot. Both within the principal's read scope.
 */
export function createPointIssueReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'eligibleFor' | 'waitingFor'> {
  return {
    async eligibleFor(monday, meetingDate, options) {
      const query = db
        .select(POINT_ROW)
        .from(points)
        .where(
          and(
            visiblePoints(ctx),
            eq(points.state, 'approved'),
            lte(dueMonday, toIsoDate(monday)),
            or(ne(points.kind, 'report'), lt(lastDay, toIsoDate(meetingDate))),
          ),
        )
        .orderBy(...HANDED_IN_FIRST);
      const rows = await (options?.lock ? query.for('update') : query);
      return rows.map(toRecord);
    },
    async waitingFor(monday, meetingDate) {
      const rows = await db
        .select({ id: points.id, kind: points.kind, state: points.state, title: points.title })
        .from(points)
        .where(
          and(
            visiblePoints(ctx),
            lte(dueMonday, toIsoDate(monday)),
            or(
              inArray(points.state, ['submitted', 'returned']),
              // An approved report whose event does not end before the meeting waits for a later issue.
              and(
                eq(points.state, 'approved'),
                eq(points.kind, 'report'),
                or(sql`${lastDay} IS NULL`, sql`${lastDay} >= ${toIsoDate(meetingDate)}`),
              ),
            ),
          ),
        )
        .orderBy(...HANDED_IN_FIRST);
      const refs = (state: string): PointRef[] =>
        rows
          .filter((row) => row.state === state)
          .map(({ id, kind, title }) => ({ id, kind, title }));
      return { submitted: refs('submitted'), returned: refs('returned'), later: refs('approved') };
    },
  };
}
