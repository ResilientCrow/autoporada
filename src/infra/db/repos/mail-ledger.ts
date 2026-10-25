import { and, count, eq, gt, inArray, min, sql } from 'drizzle-orm';

import {
  ScopeViolation,
  type LedgerState,
  type MailLedgerPort,
  type TxContext,
} from '@/application/ports';

import { mailGate, mailLedger } from '../schema';
import type { TxDatabase } from './database';

/** The pg_advisory_xact_lock key of the gate and the window ('MAIL'). */
const MAIL_GATE_LOCK = 0x4d41_494c;

/** States whose claim sent something; a deferred or skipped row frees its slot. */
const SENDS: readonly LedgerState[] = ['sending', 'unknown', 'sent', 'failed'];

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
    async lockGate() {
      allowed();
      await db.execute(sql`SELECT pg_advisory_xact_lock(${MAIL_GATE_LOCK})`);
    },
    async get(dedupeKey) {
      allowed();
      const [row] = await db.select().from(mailLedger).where(eq(mailLedger.dedupeKey, dedupeKey));
      return row ?? null;
    },
    async gate() {
      allowed();
      const [row] = await db
        .select({ notBefore: mailGate.notBefore, code: mailGate.code })
        .from(mailGate);
      // Migration 0009 inserts the row and nothing deletes it.
      if (!row) throw new Error('gate: mail_gate has no row');
      return row;
    },
    async callsSince(instant) {
      allowed();
      const [row] = await db
        .select({ count: count(), oldest: min(mailLedger.claimedAt) })
        .from(mailLedger)
        .where(and(gt(mailLedger.claimedAt, instant), inArray(mailLedger.state, SENDS)));
      return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
    },
    async claim(row) {
      allowed();
      const claimed = {
        template: row.template,
        recipientId: row.recipientId,
        subjectId: row.subjectId,
        state: 'sending' as const,
        unknownSends: row.unknownSends,
        capFrom: row.capFrom,
        jobId: row.jobId,
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
    async closeGate(until, code) {
      allowed();
      // Both expressions read the row as it was: the later instant wins, with its code.
      await db.update(mailGate).set({
        code: sql`CASE WHEN ${mailGate.notBefore} IS NULL OR ${mailGate.notBefore} < ${until}::timestamptz
                       THEN ${code} ELSE ${mailGate.code} END`,
        notBefore: sql`greatest(${mailGate.notBefore}, ${until}::timestamptz)`,
      });
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
