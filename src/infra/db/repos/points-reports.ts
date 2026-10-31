import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  type PointRepo,
  type ReportPoint,
  type TxContext,
} from '@/application/ports';
import { parseIsoDate, toIsoDate } from '@/domain/time';

import { points } from '../schema';
import type { TxDatabase } from './database';
import { dateOrNull, timeOrNull } from './wall-columns';

/** An event's last day: the end date, or else the day itself. */
const lastDay = sql`coalesce(${points.endDate}, ${points.eventDate})`;

/** What the late-report jobs read of a point: the columns migrations 0017, 0024, 0027 and 0035 grant the worker. */
const REPORT_ROW = {
  id: points.id,
  authorId: points.authorId,
  state: points.state,
  handInMonday: points.handInMonday,
  timeTo: points.timeTo,
  lastDay: sql<string | null>`${lastDay}::text`,
};

function toReportPoint(row: {
  id: string;
  authorId: string;
  state: ReportPoint['state'];
  handInMonday: string | null;
  timeTo: string | null;
  lastDay: string | null;
}): ReportPoint[] {
  const { lastDay: last, handInMonday, timeTo, ...rest } = row;
  if (last === null) return [];
  return [
    {
      ...rest,
      handInMonday: dateOrNull(handInMonday),
      lastDay: parseIsoDate(last),
      timeTo: timeOrNull(timeTo),
    },
  ];
}

/** The worker's reads of report points for the late-report jobs (ADR 0035). */
export function createPointReportReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'reportPoints' | 'reportPoint'> {
  return {
    async reportPoints({ from, to }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      const rows = await db
        .select(REPORT_ROW)
        .from(points)
        .where(
          and(
            eq(points.kind, 'report'),
            inArray(points.state, ['draft', 'submitted', 'returned', 'approved', 'published']),
            isNotNull(points.eventDate),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(points.id));
      return rows.flatMap(toReportPoint);
    },
    async reportPoint(id) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      const [row] = await db
        .select(REPORT_ROW)
        .from(points)
        .where(and(eq(points.id, id), eq(points.kind, 'report')));
      return row ? (toReportPoint(row)[0] ?? null) : null;
    },
  };
}
