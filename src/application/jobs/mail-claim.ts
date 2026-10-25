import type { GateRow, JobOutcome, LedgerRow, Settlement } from '@/application/ports';

/** Unknown sends since the last redrive a key may have before it is given up (ADR 0016). */
const UNKNOWN_SENDS_CAP = 2;

interface ClaimInput {
  /** The key's ledger row, read under the gate lock; null before its first claim. */
  readonly row: LedgerRow | null;
  /** An operator revived the job from the dead-letter queue. */
  readonly redriven: boolean;
  /** The pg-boss job asking; its retries keep the id. */
  readonly jobId: string;
}

/** What the claim transaction does with a key; the handler switches over `kind`. */
export type ClaimDecision =
  /** Write nothing, call nothing: return the outcome. */
  | { readonly kind: 'stop'; readonly outcome: JobOutcome }
  /** Settle the row as given, call nothing, return the outcome. */
  | { readonly kind: 'fail'; readonly settlement: Settlement; readonly outcome: JobOutcome }
  /**
   * Claim the row with these counts, then send; `resend` when an earlier call
   * may have gone out.
   */
  | {
      readonly kind: 'send';
      readonly unknownSends: number;
      readonly capFrom: number;
      readonly resend: boolean;
    };

const send = (unknownSends: number, capFrom: number): ClaimDecision => ({
  kind: 'send',
  unknownSends,
  capFrom,
  resend: unknownSends > 0,
});

/**
 * The ledger's rules for one key (ADR 0016, phase table). `unknownSends`
 * counts every possible copy and is never lowered, so any send after one is
 * a resend. A row still `sending` means an attempt died between claim and
 * settle: its mail may have left, so it counts as an unknown outcome here
 * (an `unknown` row was counted when it settled). The cap counts the unknown
 * sends since the last redrive (`capFrom`): at the cap the key fails as
 * ambiguous rather than risk another copy. A redrive is a human decision,
 * honoured at the revived job's first claim, whichever attempt makes it:
 * the row then names another job. A `failed` row is claimed again only
 * then, and a row the dead job left `sending`, `unknown` or `deferred` is
 * sent at once; the cap starts again from the count so far. Once the revived
 * job has claimed, its retries keep the cap and stop at a failed row, and a
 * `deferred` row keeps its counts.
 */
export function claimDecision({ row, redriven, jobId }: ClaimInput): ClaimDecision {
  if (!row) return send(0, 0);
  const revived = redriven && row.jobId !== jobId;
  switch (row.state) {
    case 'sent':
    case 'skipped':
      return { kind: 'stop', outcome: { kind: 'done', code: `already.${row.state}` } };
    case 'failed':
      return revived
        ? send(row.unknownSends, row.unknownSends)
        : { kind: 'stop', outcome: { kind: 'dead', code: 'already.failed' } };
    case 'deferred':
      return send(row.unknownSends, revived ? row.unknownSends : row.capFrom);
    case 'sending':
    case 'unknown': {
      const unknownSends = row.unknownSends + (row.state === 'sending' ? 1 : 0);
      if (revived) return send(unknownSends, unknownSends);
      if (unknownSends - row.capFrom < UNKNOWN_SENDS_CAP) return send(unknownSends, row.capFrom);
      return {
        kind: 'fail',
        settlement: { state: 'failed', code: 'ambiguous', unknownSends },
        outcome: { kind: 'dead', code: 'ambiguous' },
      };
    }
  }
}

/** Sends per sliding minute: below Exchange's 30 per mailbox (ADR 0016). */
const WINDOW_SENDS = 20;
export const WINDOW_MS = 60_000;

interface PaceInput {
  readonly gate: GateRow;
  /** Sends claimed in (now − WINDOW_MS, now]: `callsSince(now − WINDOW_MS)`. */
  readonly calls: { readonly count: number; readonly oldest: Date | null };
  readonly now: Date;
}

/**
 * Whether a send may start now, read under the gate lock: a closed gate (a
 * Retry-After or an auth pause) holds everyone until it opens; a full window
 * holds until its oldest send leaves it. Null when the send may go.
 */
export function paceDecision({ gate, calls, now }: PaceInput): JobOutcome | null {
  if (gate.notBefore && gate.notBefore > now) {
    return { kind: 'wait', until: gate.notBefore, code: 'wait.gate' };
  }
  if (calls.count < WINDOW_SENDS) return null;
  const oldest = (calls.oldest ?? now).getTime();
  return { kind: 'wait', until: new Date(oldest + WINDOW_MS), code: 'wait.window' };
}
