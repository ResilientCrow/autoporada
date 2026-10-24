import {
  DatabaseFailure,
  ScopeViolation,
  type LedgerRow,
  type MailLedgerPort,
  type TxContext,
} from '@/application/ports';

import { guard } from './guards';
import type { FakeTxState } from './state';

const DELIVERY_PRINCIPAL = /^(job|cli):/;

/**
 * The mail ledger over the fake state, with the same scope, foreign key and
 * timing rules; never audited.
 */
export function fakeMailLedger(tx: FakeTxState, ctx: TxContext): MailLedgerPort {
  const { principal, now } = ctx;
  const { mailLedger, users } = tx.draft;
  const enter = (write: boolean) => {
    guard(tx, write);
    if (principal.kind !== 'system' || !DELIVERY_PRINCIPAL.test(principal.reason)) {
      throw new ScopeViolation();
    }
  };
  /** mail_ledger_recipient_id_users_id_fk */
  const recipientExists = (recipientId: string) => {
    if (!users.has(recipientId)) throw new DatabaseFailure('23503');
  };

  return {
    async get(dedupeKey) {
      enter(false);
      return mailLedger.get(dedupeKey) ?? null;
    },
    async claim(row) {
      enter(true);
      recipientExists(row.recipientId);
      const before = mailLedger.get(row.dedupeKey);
      mailLedger.set(row.dedupeKey, {
        ...row,
        state: 'sending',
        attempts: (before?.attempts ?? 0) + 1,
        claimedAt: now,
        settledAt: null,
        code: null,
        graphRequestId: null,
      });
    },
    async settle(dedupeKey, settlement) {
      enter(true);
      const before = mailLedger.get(dedupeKey);
      if (!before) throw new Error('settle: the key has no ledger row');
      mailLedger.set(dedupeKey, {
        ...before,
        state: settlement.state,
        code: settlement.code,
        settledAt: now,
        graphRequestId: settlement.graphRequestId ?? null,
        unknownSends: settlement.unknownSends ?? before.unknownSends,
      });
    },
    async skip({ code, ...row }) {
      enter(true);
      recipientExists(row.recipientId);
      const before: Pick<LedgerRow, 'unknownSends' | 'attempts' | 'claimedAt'> = mailLedger.get(
        row.dedupeKey,
      ) ?? { unknownSends: 0, attempts: 0, claimedAt: null };
      mailLedger.set(row.dedupeKey, {
        ...row,
        unknownSends: before.unknownSends,
        attempts: before.attempts,
        claimedAt: before.claimedAt,
        state: 'skipped',
        code,
        settledAt: now,
        graphRequestId: null,
      });
    },
    async purgeBefore(cutoff) {
      enter(true);
      const old = [...mailLedger.values()].filter((row) => {
        const at = row.settledAt ?? row.claimedAt;
        return at !== null && at < cutoff;
      });
      for (const row of old) mailLedger.delete(row.dedupeKey);
      return old.length;
    },
  };
}
