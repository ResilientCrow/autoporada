import { and, asc, eq, exists, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  type EndingAkce,
  type FutureItemRepo,
  type TxContext,
} from '@/application/ports';
import { parseIsoDate, toIsoDate, type CalDate } from '@/domain/time';

import { futureItems, points } from '../schema';
import type { TxDatabase } from './database';
import { timeOrNull } from './wall-columns';

/** An item's last day: the end date, or else the start date. */
const lastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;

/**
 * An approved akce (every one owes a report, ADR 0048) whose report nobody has handed in: none started (`report_state` none
 * or prompted, no report point), or its report point still `draft` or `returned`. The point's state
 * is all this reads of it, a column migration 0017 grants the worker.
 */
export const reportNotHandedIn = (db: TxDatabase) =>
  and(
    eq(futureItems.state, 'approved'),
    eq(futureItems.kind, 'akce'),
    or(
      and(
        inArray(futureItems.reportState, ['none', 'prompted']),
        isNull(futureItems.reportPointId),
      ),
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
  );

/** What the late-report mails read of an akce: columns migrations 0022, 0035 and 0046 grant the worker. */
const ENDING_ROW = {
  id: futureItems.id,
  authorId: futureItems.authorId,
  state: futureItems.state,
  reportState: futureItems.reportState,
  timeTo: futureItems.timeTo,
  lastDay: sql<string | null>`${lastDay}::text`,
};

function toEnding(row: {
  id: string;
  authorId: string;
  state: EndingAkce['state'];
  reportState: EndingAkce['reportState'];
  timeTo: string | null;
  lastDay: string;
}): EndingAkce {
  return { ...row, lastDay: parseIsoDate(row.lastDay), timeTo: timeOrNull(row.timeTo) };
}

/** The worker's reads of the akce whose report is about to be late (ADR 0035) or is owed (ADR 0046). */
export function createFutureReportReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<FutureItemRepo, 'reportsEnding' | 'reportEnding' | 'reportsOwed'> {
  /** The ending rows that `where` keeps, ordered by id; one with no date is left out. */
  const endingRows = async (where: ReturnType<typeof and>) => {
    const rows = await db
      .select(ENDING_ROW)
      .from(futureItems)
      .where(where)
      .orderBy(asc(futureItems.id));
    return rows.flatMap((row) =>
      row.lastDay === null ? [] : [toEnding({ ...row, lastDay: row.lastDay })],
    );
  };
  const lastDayIn = (from: CalDate, to: CalDate) =>
    and(gte(lastDay, toIsoDate(from)), lte(lastDay, toIsoDate(to)));
  return {
    async reportsEnding({ from, to }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      return endingRows(
        and(
          eq(futureItems.state, 'approved'),
          eq(futureItems.kind, 'akce'),
          inArray(futureItems.reportState, ['none', 'prompted']),
          isNull(futureItems.reportPointId),
          lastDayIn(from, to),
        ),
      );
    },
    async reportsOwed({ from, to }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      return endingRows(and(reportNotHandedIn(db), lastDayIn(from, to)));
    },
    async reportEnding(id) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db
        .select(ENDING_ROW)
        .from(futureItems)
        .where(and(eq(futureItems.id, id), eq(futureItems.kind, 'akce')));
      return row && row.lastDay !== null ? toEnding({ ...row, lastDay: row.lastDay }) : null;
    },
  };
}
