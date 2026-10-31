import { and, asc, desc, eq, exists, isNotNull, lt } from 'drizzle-orm';

import { ScopeViolation, type IssueItemRepo, type TxContext } from '@/application/ports';
import { SECTIONS, type Outline, type OutlineRow } from '@/domain/outline';
import { can } from '@/domain/policy';
import { parseIsoDate, toIsoDate } from '@/domain/time';

import { issueItems, issues } from '../schema';
import type { TxDatabase } from './database';

const toRow = (row: typeof issueItems.$inferSelect): OutlineRow => ({
  lineageId: row.lineageId,
  section: row.section,
  slot: row.slot,
  persistence: row.persistence,
  title: row.title,
  body: row.body,
  quotes: row.quotes,
  sourcePointId: row.sourcePointId,
});

export function createIssueItemRepo(db: TxDatabase, ctx: TxContext): IssueItemRepo {
  const { principal } = ctx;
  const forIssue: IssueItemRepo['forIssue'] = async (issueId) => {
    const rows = await db
      .select()
      .from(issueItems)
      .where(eq(issueItems.issueId, issueId))
      .orderBy(asc(issueItems.section), asc(issueItems.position));
    return {
      pokyny: rows.filter((r) => r.section === 'pokyny').map(toRow),
      hospodareni: rows.filter((r) => r.section === 'hospodareni').map(toRow),
    };
  };

  return {
    forIssue,
    async replace(issueId, outline: Outline) {
      // A privileged write re-checks the policy, whatever the use case declared (ADR 0011).
      if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.edit' })) {
        throw new ScopeViolation();
      }
      await db.delete(issueItems).where(eq(issueItems.issueId, issueId));
      const values = SECTIONS.flatMap((section) =>
        outline[section].map((row, position) => ({
          issueId,
          section,
          position,
          lineageId: row.lineageId,
          slot: row.slot,
          persistence: row.persistence,
          title: row.title,
          body: row.body,
          quotes: [...row.quotes],
          sourcePointId: row.sourcePointId,
          createdAt: ctx.now,
        })),
      );
      if (values.length > 0) await db.insert(issueItems).values(values);
    },
    async textsOf(issueId) {
      const [row] = await db
        .select({ present: issues.presentText, guests: issues.guestsText, annex2: issues.annex2 })
        .from(issues)
        .where(eq(issues.id, issueId));
      return row ?? { present: null, guests: null, annex2: null };
    },
    async latestSourceBefore(monday) {
      const [issue] = await db
        .select({ id: issues.id, status: issues.status, meetingDate: issues.meetingDate })
        .from(issues)
        .where(
          and(
            lt(issues.monday, toIsoDate(monday)),
            exists(
              db
                .select({ one: issueItems.id })
                .from(issueItems)
                .where(eq(issueItems.issueId, issues.id)),
            ),
          ),
        )
        .orderBy(desc(issues.monday))
        .limit(1);
      if (!issue) return null;
      return {
        status: issue.status,
        meetingDate: parseIsoDate(issue.meetingDate),
        outline: await forIssue(issue.id),
      };
    },
    async latestTextsBefore(monday) {
      const before = lt(issues.monday, toIsoDate(monday));
      const [present] = await db
        .select({ value: issues.presentText })
        .from(issues)
        .where(and(before, isNotNull(issues.presentText)))
        .orderBy(desc(issues.monday))
        .limit(1);
      const [guests] = await db
        .select({ value: issues.guestsText })
        .from(issues)
        .where(and(before, isNotNull(issues.guestsText)))
        .orderBy(desc(issues.monday))
        .limit(1);
      const [annex2] = await db
        .select({ value: issues.annex2 })
        .from(issues)
        .where(and(before, isNotNull(issues.annex2)))
        .orderBy(desc(issues.monday))
        .limit(1);
      return {
        present: present?.value ?? null,
        guests: guests?.value ?? null,
        annex2: annex2?.value ?? null,
      };
    },
  };
}
