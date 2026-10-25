import {
  DatabaseFailure,
  isOutcomeCode,
  ScopeViolation,
  type LedgerRow,
  type LedgerState,
  type MailLedgerPort,
  type TxContext,
} from '@/application/ports';

import { guard } from './guards';
import type { FakeTxState } from './state';

const SENDS: readonly LedgerState[] = ['sending', 'unknown', 'sent', 'failed'];
const DELIVERY_PRINCIPAL = /^(job|cli):/;
/** An unregistered constraint, as infra/db/pg-errors.ts reports it. */
const refusedBy = (constraint: string) => new DatabaseFailure(`db.constraint.${constraint}`);

/**
 * The mail ledger over the fake state, with the same scope, foreign key and
 * timing rules; never audited. The fake runs one transaction at a time, so
 * the gate lock has nothing left to serialise.
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
  /** mail_ledger_code: the CHECK is isOutcomeCode's pattern and length. */
  const codeAllowed = (code: string) => {
    if (!isOutcomeCode(code)) throw refusedBy('mail_ledger_code');
  };
  const lengthsAllowed = (dedupeKey: string, graphRequestId?: string | null) => {
    if (dedupeKey.length > 120) throw refusedBy('mail_ledger_dedupe_key_length');
    if ((graphRequestId?.length ?? 0) > 64) throw refusedBy('mail_ledger_graph_request_id_length');
  };
  /**
   * PostgreSQL runs a table's CHECKs in name order, so a negative count with a
   * cap of zero or more is refused by mail_ledger_cap_from first.
   */
  const countsAllowed = ({
    unknownSends,
    capFrom,
  }: Pick<LedgerRow, 'unknownSends' | 'capFrom'>) => {
    if (capFrom < 0 || capFrom > unknownSends) throw refusedBy('mail_ledger_cap_from');
    // Never reached after cap_from, as in PostgreSQL; it mirrors the CHECK.
    if (unknownSends < 0) throw refusedBy('mail_ledger_unknown_sends');
  };
  const recipientExists = (recipientId: string) => {
    if (!users.has(recipientId)) throw refusedBy('mail_ledger_recipient_id_users_id_fk');
  };

  return {
    async lockGate() {
      enter(false);
    },
    async get(dedupeKey) {
      enter(false);
      return mailLedger.get(dedupeKey) ?? null;
    },
    async gate() {
      enter(false);
      return { ...tx.draft.mailGate };
    },
    async callsSince(instant) {
      enter(false);
      const claims = [...mailLedger.values()]
        .filter((row) => SENDS.includes(row.state))
        .flatMap((row) => (row.claimedAt && row.claimedAt > instant ? [row.claimedAt] : []));
      const oldest = claims.reduce<Date | null>((a, b) => (a && a <= b ? a : b), null);
      return { count: claims.length, oldest };
    },
    async claim(row) {
      enter(true);
      lengthsAllowed(row.dedupeKey);
      countsAllowed(row);
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
      codeAllowed(settlement.code);
      lengthsAllowed(dedupeKey, settlement.graphRequestId);
      const unknownSends = settlement.unknownSends ?? before.unknownSends;
      countsAllowed({ unknownSends, capFrom: before.capFrom });
      mailLedger.set(dedupeKey, {
        ...before,
        state: settlement.state,
        code: settlement.code,
        settledAt: now,
        graphRequestId: settlement.graphRequestId ?? null,
        unknownSends,
      });
    },
    async skip({ code, ...row }) {
      enter(true);
      lengthsAllowed(row.dedupeKey);
      recipientExists(row.recipientId);
      codeAllowed(code);
      const claimed = mailLedger.get(row.dedupeKey);
      mailLedger.set(row.dedupeKey, {
        ...row,
        unknownSends: claimed?.unknownSends ?? 0,
        capFrom: claimed?.capFrom ?? 0,
        jobId: claimed?.jobId ?? null,
        attempts: claimed?.attempts ?? 0,
        claimedAt: claimed?.claimedAt ?? null,
        state: 'skipped',
        code,
        settledAt: now,
        graphRequestId: null,
      });
    },
    async closeGate(until, code) {
      enter(true);
      const { notBefore } = tx.draft.mailGate;
      if (notBefore === null || notBefore < until) tx.draft.mailGate = { notBefore: until, code };
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
