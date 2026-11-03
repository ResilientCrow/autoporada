import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  StaleVersion,
  type FutureItemRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';
import { REPORT_MACHINE } from '@/domain/review';
import { toIsoDate, type CalDate } from '@/domain/time';

import { futureItems } from '../schema';
import type { TxDatabase } from './database';
import { ITEM_ROW, toRecord, visibleFutureItems } from './future-items';
import { owedAkce } from './future-owed';
import { reportNotHandedIn } from './future-reports';

/** An item's last day: the end date, or else the start date. */
const lastDay = sql`coalesce(${futureItems.endDate}, ${futureItems.startDate})`;

/** What an issue reads of the future items: those whose last day is not before the meeting date. */
export function createFutureIssueReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<FutureItemRepo, 'forIssue' | 'waitingFor' | 'awaitingReport' | 'owedTo' | 'markMissed'> {
  const { principal, now } = ctx;
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
            reportNotHandedIn(db),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(futureItems.startDate), asc(futureItems.id));
      return rows.map(toRecord);
    },
    async owedTo({ from, to }) {
      const rows = await db
        .select(ITEM_ROW)
        .from(futureItems)
        .where(
          and(
            visibleFutureItems(ctx),
            owedAkce,
            ne(futureItems.reportState, 'missed'),
            gte(lastDay, toIsoDate(from)),
            lte(lastDay, toIsoDate(to)),
          ),
        )
        .orderBy(asc(futureItems.startDate), asc(futureItems.id));
      return rows.map(toRecord);
    },
    async markMissed(id, expectedVersion) {
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.generate' })) {
        throw new ScopeViolation();
      }
      const [row] = await db
        .update(futureItems)
        .set({
          reportState: REPORT_MACHINE.miss.to,
          version: sql`${futureItems.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(futureItems.id, id),
            eq(futureItems.version, expectedVersion),
            owedAkce,
            inArray(futureItems.reportState, [...REPORT_MACHINE.miss.from]),
          ),
        )
        .returning(ITEM_ROW);
      if (!row) throw new StaleVersion();
      return toRecord(row);
    },
  };
}
