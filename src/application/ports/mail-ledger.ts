import type { TemplateName } from '@/notify';

import type { OutcomeCode } from './jobs';

/** Where a dedupe key's mail stands (ADR 0016). */
export type LedgerState = 'sending' | 'unknown' | 'sent' | 'deferred' | 'skipped' | 'failed';

/** One row per dedupe key: ids, states and short codes, never an address or text. */
export interface LedgerRow {
  readonly dedupeKey: string;
  readonly template: TemplateName;
  readonly recipientId: string;
  readonly subjectId: string;
  readonly state: LedgerState;
  /** Sends whose outcome is unknown; the claim rules cap them. */
  readonly unknownSends: number;
  readonly attempts: number;
  /** When a Graph or SMTP call was last started for this key. */
  readonly claimedAt: Date | null;
  readonly settledAt: Date | null;
  readonly code: OutcomeCode | null;
  readonly graphRequestId: string | null;
}

export type ClaimRow = Pick<
  LedgerRow,
  'dedupeKey' | 'template' | 'recipientId' | 'subjectId' | 'unknownSends'
>;

export type SkipRow = Pick<LedgerRow, 'dedupeKey' | 'template' | 'recipientId' | 'subjectId'> & {
  readonly code: OutcomeCode;
};

export interface Settlement {
  readonly state: Exclude<LedgerState, 'sending' | 'skipped'>;
  readonly code: OutcomeCode;
  /** Microsoft's request id of an accepted mail; empty otherwise. */
  readonly graphRequestId?: string | null;
  /** Unchanged when left out. */
  readonly unknownSends?: number;
}

/**
 * The mail ledger on the transaction's connection. Primitives only: the
 * rules live in application/jobs. Every time is the transaction's
 * `ctx.now`, never the database clock, so tests drive it with a
 * FixedClock. Only `system('job:…')` and `system('cli:…')` may use it
 * (ScopeViolation otherwise); rows need an existing recipient, and deleting
 * the recipient deletes their rows.
 */
export interface MailLedgerPort {
  get(dedupeKey: string): Promise<LedgerRow | null>;
  /**
   * Inserts or overwrites the row as `sending`: `claimed_at` now, one more
   * attempt, the given unknown count; code, settlement and request id cleared.
   */
  claim(row: ClaimRow): Promise<void>;
  /** Records the outcome of a claim, settled now. Throws if the key has no row. */
  settle(dedupeKey: string, settlement: Settlement): Promise<void>;
  /** Inserts or overwrites the row as `skipped`, settled now; it never counts as a send. */
  skip(row: SkipRow): Promise<void>;
  /** Deletes rows settled, or claimed and never settled, before `cutoff`; returns how many. */
  purgeBefore(cutoff: Date): Promise<number>;
}
