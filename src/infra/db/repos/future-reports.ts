import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  type EndingAkce,
  type FutureItemRepo,
  type TxContext,
} from '@/application/ports';
import { parseIsoDate, toIsoDate } from '@/domain/time';

import { futureItems } from '../schema';
import type { TxDatabase } from './database';
import { timeOrNull } from './wall-columns';

/** An item's last day: the end date, or else the start date. */
const lastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;

/** What the late-report mails read of an akce: the columns migrations 0022 and 0035 grant the worker. */
const ENDING_ROW = {
  id: futureItems.id,
  authorId: futureItems.authorId,
  state: futureItems.state,
  expectsReport: futureItems.expectsReport,
  reportState: futureItems.reportState,
  timeTo: futureItems.timeTo,
  lastDay: sql<string | null>`${lastDay}::text`,
};

function toEnding(row: {
  id: string;
  authorId: string;
  state: EndingAkce['state'];
  expectsReport: boolean;
  reportState: EndingAkce['reportState'];
  timeTo: string | null;
  lastDay: string;
}): EndingAkce {
  return { ...row, lastDay: parseIsoDate(row.lastDay), timeTo: timeOrNull(row.timeTo) };
}

/** The worker's reads of the akce whose report is about to be late (ADR 0035). */
export function createFutureReportReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<FutureItemRepo, 'reportsEnding' | 'reportEnding'> {
  return {
    async reportsEnding({ from, to }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      const rows = await db
        .select(ENDING_ROW)
        .from(futureItems)
        .where(
          and(
            eq(futureItems.state, 'approved'),
            eq(futureItems.expectsReport, true),
            inArray(futureItems.reportState, ['none', 'prompted']),
            isNull(futureItems.reportPointId),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(futureItems.id));
      return rows.flatMap((row) =>
        row.lastDay === null ? [] : [toEnding({ ...row, lastDay: row.lastDay })],
      );
    },
    async reportEnding(id) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db.select(ENDING_ROW).from(futureItems).where(eq(futureItems.id, id));
      return row && row.lastDay !== null ? toEnding({ ...row, lastDay: row.lastDay }) : null;
    },
  };
}
