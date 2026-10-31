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
  /** Sends whose outcome is unknown: every possible copy, never lowered. */
  readonly unknownSends: number;
  /**
   * `unknownSends` when the key was last redriven: the cap counts the unknown
   * sends after it. 0 until a redrive; never above `unknownSends`.
   */
  readonly capFrom: number;
  /** The pg-boss job that last claimed the key; null before any claim. */
  readonly jobId: string | null;
  readonly attempts: number;
  /** When a Graph or SMTP call was last started for this key. */
  readonly claimedAt: Date | null;
  readonly settledAt: Date | null;
  readonly code: OutcomeCode | null;
  readonly graphRequestId: string | null;
}

/** The pause on all sending: closed while `notBefore` is in the future. */
export interface GateRow {
  readonly notBefore: Date | null;
  readonly code: OutcomeCode | null;
}

export type ClaimRow = Pick<
  LedgerRow,
  'dedupeKey' | 'template' | 'recipientId' | 'subjectId' | 'unknownSends' | 'capFrom'
> & { readonly jobId: string };

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
 * The mail ledger and gate on the transaction's connection. Primitives only:
 * the rules live in application/jobs. Every time is the transaction's
 * `ctx.now`, never the database clock, so tests drive the window with a
 * FixedClock. Only `system('job:…')` and `system('cli:…')` may use it
 * (ScopeViolation otherwise); rows need an existing recipient, and deleting
 * the recipient deletes their rows.
 */
export interface MailLedgerPort {
  /** Serialises everyone who reads or moves the gate and the window, until the transaction ends. */
  lockGate(): Promise<void>;
  get(dedupeKey: string): Promise<LedgerRow | null>;
  gate(): Promise<GateRow>;
  /** Sends claimed strictly after `instant`: rows `sending`, `unknown`, `sent` or `failed`. */
  callsSince(instant: Date): Promise<{ readonly count: number; readonly oldest: Date | null }>;
  /**
   * Inserts or overwrites the row as `sending`: `claimed_at` now, one more
   * attempt, the given job, unknown count and cap start; code, settlement and
   * request id cleared.
   */
  claim(row: ClaimRow): Promise<void>;
  /** Records the outcome of a claim, settled now. Throws if the key has no row. */
  settle(dedupeKey: string, settlement: Settlement): Promise<void>;
  /**
   * Inserts or overwrites the row as `skipped`, settled now; it never counts
   * as a send. An earlier claim's job, counts and attempts are kept.
   */
  skip(row: SkipRow): Promise<void>;
  /**
   * When the latest mail of `template` that reached `recipientId` (state `sent`) was claimed, or
   * null if none did: the watermark a digest counts from. A deferred, failed or skipped row does
   * not count, nor does a mail still being sent.
   */
  lastSent(template: TemplateName, recipientId: string): Promise<Date | null>;
  /** Pauses sending until `until`, unless it is already paused longer. */
  closeGate(until: Date, code: OutcomeCode): Promise<void>;
  /** Deletes rows settled, or claimed and never settled, before `cutoff`; returns how many. */
  purgeBefore(cutoff: Date): Promise<number>;
}
