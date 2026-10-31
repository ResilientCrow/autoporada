import { and, asc, eq, gte, inArray, isNotNull, lte, not, or, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  type PointRepo,
  type ReportPoint,
  type TxContext,
} from '@/application/ports';
import { LATE_GRACE_MS } from '@/domain/calendar';
import { parseIsoDate, toIsoDate, type CalDate } from '@/domain/time';

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

/**
 * The SQL twin of `isLateReport` (domain/calendar/late-report.ts): a report about an event that
 * ends before the meeting day, whose close, the event's end + 2 h capped at 00.00 of the meeting
 * day, is after the deadline. A parity contract test keeps the two in step.
 * TODO(m9-verify): this SQL has not run against PostgreSQL; check the parity test, incl. the DST nights.
 */
function lateFor(meetingDate: CalDate, deadlineAt: Date) {
  const end = sql`((${lastDay} + coalesce(${points.timeTo}, time '20:00')) AT TIME ZONE 'Europe/Prague')`;
  const cap = sql`(${toIsoDate(meetingDate)}::date::timestamp AT TIME ZONE 'Europe/Prague')`;
  return sql<boolean>`coalesce(
    ${points.kind} = 'report'
    AND ${points.eventDate} IS NOT NULL
    AND ${lastDay} < ${toIsoDate(meetingDate)}::date
    AND least(${end} + make_interval(secs => ${LATE_GRACE_MS / 1000}::float8), ${cap}) > ${deadlineAt.toISOString()}::timestamptz,
    false)`;
}

/** The worker's reads of report points for the late-report jobs (ADR 0035). */
export function createPointReportReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'reportPoints' | 'reportPoint' | 'reminderAuthors'> {
  return {
    async reminderAuthors({ draftsSince, monday, meetingDate, deadlineAt }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      // The columns migrations 0017, 0024 and 0035 grant the worker, and no other.
      const rows = await db
        .selectDistinct({ authorId: points.authorId })
        .from(points)
        .where(
          and(
            or(
              and(eq(points.state, 'draft'), gte(points.updatedAt, draftsSince)),
              and(eq(points.state, 'returned'), lte(points.earliestMonday, toIsoDate(monday))),
            ),
            not(lateFor(meetingDate, deadlineAt)),
          ),
        )
        .orderBy(asc(points.authorId));
      return rows.map((row) => row.authorId);
    },
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
