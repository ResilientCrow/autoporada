import { eq, sql } from 'drizzle-orm';

import { ScopeViolation, type MailLedgerPort, type TxContext } from '@/application/ports';

import { mailLedger } from '../schema';
import type { TxDatabase } from './database';

/** Only jobs and the operator's CLI read or write delivery state (ADR 0016). */
const DELIVERY_PRINCIPAL = /^(job|cli):/;

export function createMailLedgerRepo(db: TxDatabase, ctx: TxContext): MailLedgerPort {
  const { principal, now } = ctx;
  const allowed = () => {
    if (principal.kind !== 'system' || !DELIVERY_PRINCIPAL.test(principal.reason)) {
      throw new ScopeViolation();
    }
  };

  return {
    async get(dedupeKey) {
      allowed();
      const [row] = await db.select().from(mailLedger).where(eq(mailLedger.dedupeKey, dedupeKey));
      return row ?? null;
    },
    async claim(row) {
      allowed();
      const claimed = {
        template: row.template,
        recipientId: row.recipientId,
        subjectId: row.subjectId,
        state: 'sending' as const,
        unknownSends: row.unknownSends,
        claimedAt: now,
        settledAt: null,
        code: null,
        graphRequestId: null,
      };
      await db
        .insert(mailLedger)
        .values({ dedupeKey: row.dedupeKey, ...claimed, attempts: 1 })
        .onConflictDoUpdate({
          target: mailLedger.dedupeKey,
          set: { ...claimed, attempts: sql`${mailLedger.attempts} + 1` },
        });
    },
    async settle(dedupeKey, settlement) {
      allowed();
      const settled = await db
        .update(mailLedger)
        .set({
          state: settlement.state,
          code: settlement.code,
          settledAt: now,
          graphRequestId: settlement.graphRequestId ?? null,
          ...(settlement.unknownSends !== undefined && { unknownSends: settlement.unknownSends }),
        })
        .where(eq(mailLedger.dedupeKey, dedupeKey))
        .returning({ dedupeKey: mailLedger.dedupeKey });
      if (settled.length === 0) throw new Error('settle: the key has no ledger row');
    },
    async skip(row) {
      allowed();
      const skipped = {
        template: row.template,
        recipientId: row.recipientId,
        subjectId: row.subjectId,
        state: 'skipped' as const,
        code: row.code,
        settledAt: now,
        graphRequestId: null,
      };
      await db
        .insert(mailLedger)
        .values({ dedupeKey: row.dedupeKey, ...skipped })
        .onConflictDoUpdate({ target: mailLedger.dedupeKey, set: skipped });
    },
    async purgeBefore(cutoff) {
      allowed();
      const purged = await db
        .delete(mailLedger)
        .where(
          sql`coalesce(${mailLedger.settledAt}, ${mailLedger.claimedAt}) < ${cutoff}::timestamptz`,
        )
        .returning({ dedupeKey: mailLedger.dedupeKey });
      return purged.length;
    },
  };
}
