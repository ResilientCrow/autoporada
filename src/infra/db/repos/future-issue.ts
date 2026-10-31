import { and, asc, eq, exists, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import type { FutureItemRepo, TxContext } from '@/application/ports';
import { toIsoDate, type CalDate } from '@/domain/time';

import { futureItems, points } from '../schema';
import type { TxDatabase } from './database';
import { ITEM_ROW, toRecord, visibleFutureItems } from './future-items';

/** An item's last day: the end date, or else the start date. */
const lastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;

/** What an issue reads of the future items: those whose last day is not before the meeting date. */
export function createFutureIssueReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<FutureItemRepo, 'forIssue' | 'waitingFor' | 'awaitingReport'> {
  const reaching = (state: 'approved' | 'submitted', meetingDate: CalDate) =>
    db
      .select(ITEM_ROW)
      .from(futureItems)
      .where(
        and(
          visibleFutureItems(ctx),
          eq(futureItems.state, state),
          gte(lastDay, toIsoDate(meetingDate)),
        ),
      )
      .orderBy(asc(futureItems.startDate), asc(futureItems.id));
  return {
    async forIssue(meetingDate) {
      return (await reaching('approved', meetingDate)).map(toRecord);
    },
    async waitingFor(meetingDate) {
      return (await reaching('submitted', meetingDate)).map(toRecord);
    },
    async awaitingReport({ from, to }) {
      const rows = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(
          and(
            visibleFutureItems(ctx),
            eq(futureItems.state, 'approved'),
            eq(futureItems.expectsReport, true),
            or(
              and(
                inArray(futureItems.reportState, ['none', 'prompted']),
                isNull(futureItems.reportPointId),
              ),
              // Started but not handed in: the point's state is all this reads of it.
              exists(
                db
                  .select({ one: sql`1` })
                  .from(points)
                  .where(
                    and(
                      eq(points.id, futureItems.reportPointId),
                      inArray(points.state, ['draft', 'returned']),
                    ),
                  ),
              ),
            ),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(futureItems.startDate), asc(futureItems.id));
      return rows.map(toRecord);
    },
  };
}
