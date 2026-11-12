import { and, eq, inArray, sql } from 'drizzle-orm';

import { ScopeViolation, type ReportPlaceholderRepo, type TxContext } from '@/application/ports';
import { can } from '@/domain/policy';

import { reportPlaceholders } from '../schema';
import type { TxDatabase } from './database';

/** The headmaster's replacement paragraphs of the missing reports (ADR 0049, 0061), one per akce. */
export function createReportPlaceholderRepo(db: TxDatabase, ctx: TxContext): ReportPlaceholderRepo {
  const { principal, now } = ctx;
  const allowed = (action: 'issue.preview' | 'issue.edit') => {
    if (principal.kind === 'user' && !can(principal.actor, { action })) throw new ScopeViolation();
  };

  return {
    async many(futureItemIds) {
      allowed('issue.preview');
      if (futureItemIds.length === 0) return [];
      return db
        .select({
          futureItemId: reportPlaceholders.futureItemId,
          paragraph: reportPlaceholders.paragraph,
          confirmedOriginal: reportPlaceholders.confirmedOriginal,
          version: reportPlaceholders.version,
        })
        .from(reportPlaceholders)
        .where(inArray(reportPlaceholders.futureItemId, [...futureItemIds]));
    },
    async save(futureItemId, paragraph, expectedVersion) {
      allowed('issue.edit');
      // The insert never reaches the primary key: a row made first wins and this save is stale.
      const [row] =
        expectedVersion === 0
          ? await db
              .insert(reportPlaceholders)
              .values({ futureItemId, paragraph, updatedAt: now })
              .onConflictDoNothing({ target: reportPlaceholders.futureItemId })
              .returning({ version: reportPlaceholders.version })
          : await db
              .update(reportPlaceholders)
              .set({
                paragraph,
                confirmedOriginal: null,
                updatedAt: now,
                version: sql`${reportPlaceholders.version} + 1`,
              })
              .where(
                and(
                  eq(reportPlaceholders.futureItemId, futureItemId),
                  eq(reportPlaceholders.version, expectedVersion),
                ),
              )
              .returning({ version: reportPlaceholders.version });
      return row?.version ?? null;
    },
    async confirm(futureItemId, original, expectedVersion) {
      allowed('issue.edit');
      const [row] =
        expectedVersion === 0
          ? await db
              .insert(reportPlaceholders)
              .values({ futureItemId, confirmedOriginal: original, updatedAt: now })
              .onConflictDoNothing({ target: reportPlaceholders.futureItemId })
              .returning({ version: reportPlaceholders.version })
          : await db
              .update(reportPlaceholders)
              .set({
                confirmedOriginal: original,
                updatedAt: now,
                version: sql`${reportPlaceholders.version} + 1`,
              })
              .where(
                and(
                  eq(reportPlaceholders.futureItemId, futureItemId),
                  eq(reportPlaceholders.version, expectedVersion),
                ),
              )
              .returning({ version: reportPlaceholders.version });
      return row?.version ?? null;
    },
    async remove(futureItemId, expectedVersion) {
      allowed('issue.edit');
      const rows = await db
        .delete(reportPlaceholders)
        .where(
          and(
            eq(reportPlaceholders.futureItemId, futureItemId),
            eq(reportPlaceholders.version, expectedVersion),
          ),
        )
        .returning({ futureItemId: reportPlaceholders.futureItemId });
      return rows.length > 0;
    },
  };
}
