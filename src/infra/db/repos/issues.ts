import { and, asc, between, eq, gte, or, sql, type SQL } from 'drizzle-orm';

import {
  ScopeViolation,
  StaleVersion,
  type IssueRecord,
  type IssueRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';
import { mondayOf, parseIsoDate, toIsoDate } from '@/domain/time';

import { issues } from '../schema';
import type { TxDatabase } from './database';

const ISSUE_ROW = {
  id: issues.id,
  monday: issues.monday,
  meetingDate: issues.meetingDate,
  schoolYear: issues.schoolYear,
  deadlineAt: issues.deadlineAt,
  status: issues.status,
  version: issues.version,
};

type IssueRow = Pick<typeof issues.$inferSelect, keyof typeof ISSUE_ROW>;

const toRecord = (row: IssueRow): IssueRecord => ({
  ...row,
  monday: parseIsoDate(row.monday),
  meetingDate: parseIsoDate(row.meetingDate),
});

export function createIssueRepo(db: TxDatabase, ctx: TxContext): IssueRepo {
  const { principal } = ctx;
  /** The calendar's rows by the columns migrations 0024 and 0025 grant the worker, and no other. */
  const calendarRows = async (where: SQL | undefined) => {
    const rows = await db
      .select({
        monday: issues.monday,
        meetingDate: issues.meetingDate,
        deadlineAt: issues.deadlineAt,
        status: issues.status,
      })
      .from(issues)
      .where(where)
      .orderBy(asc(issues.monday));
    return rows.map((row) => ({
      ...row,
      monday: parseIsoDate(row.monday),
      meetingDate: parseIsoDate(row.meetingDate),
    }));
  };
  const byMonday = async (monday: string) => {
    const [row] = await db.select(ISSUE_ROW).from(issues).where(eq(issues.monday, monday));
    if (!row) throw new Error('ensure: the issue is missing after its insert');
    return toRecord(row);
  };

  /** One version-checked UPDATE of a privileged write; StaleVersion for an unknown id too. */
  const versioned = async (
    id: string,
    expectedVersion: number,
    set: Partial<
      Pick<
        typeof issues.$inferInsert,
        'status' | 'meetingDate' | 'deadlineAt' | 'presentText' | 'guestsText' | 'annex2'
      >
    >,
    action: 'issue.generate' | 'issue.edit' = 'issue.generate',
  ) => {
    // Privileged writes re-check the policy, whatever the use case declared (ADR 0011).
    if (principal.kind === 'user' && !can(principal.actor, { action })) {
      throw new ScopeViolation();
    }
    const [row] = await db
      .update(issues)
      .set({ ...set, updatedAt: ctx.now, version: sql`${issues.version} + 1` })
      .where(and(eq(issues.id, id), eq(issues.version, expectedVersion)))
      .returning(ISSUE_ROW);
    if (!row) throw new StaleVersion();
    return toRecord(row);
  };

  return {
    async ensure(issue) {
      const monday = toIsoDate(issue.monday);
      // Under READ COMMITTED a concurrent inserter waits on issues_monday_key,
      // then inserts nothing; the SELECT, a new snapshot, sees the committed row.
      const created = await db
        .insert(issues)
        .values({
          monday,
          meetingDate: toIsoDate(issue.meetingDate),
          schoolYear: issue.schoolYear,
          deadlineAt: issue.deadlineAt,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .onConflictDoNothing({ target: issues.monday })
        .returning({ id: issues.id });
      return { issue: await byMonday(monday), inserted: created.length > 0 };
    },
    async between(from, to) {
      const rows = await db
        .select(ISSUE_ROW)
        .from(issues)
        .where(between(issues.monday, toIsoDate(from), toIsoDate(to)))
        .orderBy(asc(issues.monday));
      return rows.map(toRecord);
    },
    async calendar(today) {
      return calendarRows(
        or(
          gte(issues.monday, toIsoDate(mondayOf(today))),
          gte(issues.meetingDate, toIsoDate(today)),
        ),
      );
    },
    async calendarBetween(from, to) {
      return calendarRows(between(issues.monday, toIsoDate(from), toIsoDate(to)));
    },
    async lock(id) {
      const [row] = await db.select(ISSUE_ROW).from(issues).where(eq(issues.id, id)).for('update');
      if (!row) throw new StaleVersion();
      return toRecord(row);
    },
    touch: (id, expectedVersion) => versioned(id, expectedVersion, {}, 'issue.edit'),
    setTexts: (id, expectedVersion, texts) =>
      versioned(
        id,
        expectedVersion,
        {
          ...(texts.present !== undefined && { presentText: texts.present }),
          ...(texts.guests !== undefined && { guestsText: texts.guests }),
          ...(texts.annex2 !== undefined && { annex2: texts.annex2 }),
        },
        'issue.edit',
      ),
    setStatus: (id, expectedVersion, status) => versioned(id, expectedVersion, { status }),
    async remove(id, expectedVersion) {
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.generate' })) {
        throw new ScopeViolation();
      }
      const removed = await db
        .delete(issues)
        .where(and(eq(issues.id, id), eq(issues.version, expectedVersion)))
        .returning({ id: issues.id });
      if (removed.length === 0) throw new StaleVersion();
    },
    reschedule: (id, expectedVersion, to) =>
      versioned(id, expectedVersion, {
        meetingDate: toIsoDate(to.meetingDate),
        deadlineAt: to.deadlineAt,
      }),
  };
}
