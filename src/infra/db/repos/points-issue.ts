import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { PointRef, PointRepo, TxContext } from '@/application/ports';
import { parseIsoDate, toIsoDate, type CalDate } from '@/domain/time';

import { futureItems, points } from '../schema';
import type { TxDatabase } from './database';
import { owedAkce } from './future-owed';
import { POINT_ROW, toRecord, visiblePoints } from './points-read';
import { timeOrNull } from './wall-columns';

/** The Monday a point is due for (`dueMonday`): the later of its fixed first Monday and its hand-in one. */
const dueMonday = sql`greatest(${points.earliestMonday}, ${points.handInMonday})`;

/** An event's last day: the end date, or else the day itself; null when a report has no event date. */
const lastDay = sql`coalesce(${points.endDate}, ${points.eventDate})`;

/** An akce's last day: the end date, or else the start date. */
const akceLastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;

/**
 * True when an owed akce (`owedAkce`: approved, or back in review after a revise) names the point as
 * its report (ADR 0049) and meets `extra`: the akce,
 * not the point, decides the porada. Without `extra` it tells only that the point is bound.
 */
const answersAkce = (...extra: (SQL | undefined)[]) => sql`EXISTS (
  SELECT 1 FROM ${futureItems}
  WHERE ${and(eq(futureItems.reportPointId, points.id), owedAkce, ...extra)})`;

/** The order handed in: oldest submission first, ties to the lower id. */
const HANDED_IN_FIRST = [asc(points.submittedAt), asc(points.id)];

/**
 * Report drafts (`draft` or `returned`) about an event ending from `from` to `to`, that no approved
 * akce is linked to (every one owes its report): the akce speaks for those (`FutureItemRepo.awaitingReport`).
 */
const draftReportsIn = (from: CalDate, to: CalDate) =>
  and(
    eq(points.kind, 'report'),
    inArray(points.state, ['draft', 'returned']),
    isNotNull(points.eventDate),
    gte(lastDay, toIsoDate(from)),
    lte(lastDay, toIsoDate(to)),
    sql`NOT EXISTS (
      SELECT 1 FROM ${futureItems}
      WHERE ${futureItems.reportPointId} = ${points.id}
        AND ${futureItems.state} = 'approved'
        AND ${futureItems.kind} = 'akce')`,
  );

/**
 * What an issue reads of the points (design section 3): the SQL twin of `inIssue` in
 * domain/calendar, and what waits for the slot. Both within the principal's read scope.
 */
export function createPointIssueReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'eligibleFor' | 'waitingFor' | 'draftReports' | 'draftReportFacts'> {
  return {
    async eligibleFor(monday, meetingDate, options) {
      const query = db
        .select(POINT_ROW)
        .from(points)
        .where(
          and(
            visiblePoints(ctx),
            eq(points.state, 'approved'),
            or(
              // A report of an approved akce goes by the akce, whatever its hand-in Monday (ADR 0049).
              answersAkce(
                gte(akceLastDay, toIsoDate(options.since)),
                lt(akceLastDay, toIsoDate(meetingDate)),
              ),
              and(
                not(answersAkce()),
                lte(dueMonday, toIsoDate(monday)),
                or(ne(points.kind, 'report'), lt(lastDay, toIsoDate(meetingDate))),
              ),
            ),
          ),
        )
        .orderBy(...HANDED_IN_FIRST);
      const rows = await (options.lock ? query.for('update') : query);
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
                or(
                  // The akce decides when it is bound (ADR 0049); else the report's own last day.
                  answersAkce(gte(akceLastDay, toIsoDate(meetingDate))),
                  and(
                    not(answersAkce()),
                    or(sql`${lastDay} IS NULL`, sql`${lastDay} >= ${toIsoDate(meetingDate)}`),
                  ),
                ),
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
    async draftReports({ from, to }) {
      const rows = await db
        .select(POINT_ROW)
        .from(points)
        .where(and(visiblePoints(ctx), draftReportsIn(from, to)))
        .orderBy(asc(points.id));
      return rows.map(toRecord);
    },
    async draftReportFacts({ from, to }) {
      const rows = await db
        .select({
          id: points.id,
          timeTo: points.timeTo,
          lastDay: sql<string>`${lastDay}::text`,
        })
        .from(points)
        .where(draftReportsIn(from, to))
        .orderBy(asc(points.id));
      return rows.map(({ id, timeTo, lastDay: last }) => ({
        id,
        lastDay: parseIsoDate(last),
        timeTo: timeOrNull(timeTo),
      }));
    },
  };
}
