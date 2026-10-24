import type { JobOutcome, LedgerRow, Settlement } from '@/application/ports';

/** Sends with an unknown outcome a key may have before it is given up (ADR 0016). */
const UNKNOWN_SENDS_CAP = 2;

interface ClaimInput {
  /** The key's ledger row, read under the gate lock; null before its first claim. */
  readonly row: LedgerRow | null;
  /** An operator revived the job from the dead-letter queue. */
  readonly redriven: boolean;
}

/** What the claim transaction does with a key; the handler switches over `kind`. */
export type ClaimDecision =
  /** Write nothing, call nothing: return the outcome. */
  | { readonly kind: 'stop'; readonly outcome: JobOutcome }
  /** Settle the row as given, call nothing, return the outcome. */
  | { readonly kind: 'fail'; readonly settlement: Settlement; readonly outcome: JobOutcome }
  /** Claim the row with this unknown count, then send; `resend` when an earlier call may have gone out. */
  | { readonly kind: 'send'; readonly unknownSends: number; readonly resend: boolean };

const send = (unknownSends: number, resend: boolean): ClaimDecision => ({
  kind: 'send',
  unknownSends,
  resend,
});

/**
 * The ledger's rules for one key (ADR 0016, phase table). A row still
 * `sending` means an attempt died between claim and settle: its mail may
 * have left, so it counts as an unknown outcome here (an `unknown` row was
 * counted when it settled). At the cap the key fails as ambiguous rather
 * than risk a third copy. A `failed` row is claimed again only for a
 * redrive, a human decision, with a fresh count; it is still a resend when
 * the row failed as ambiguous.
 */
export function claimDecision({ row, redriven }: ClaimInput): ClaimDecision {
  if (!row) return send(0, false);
  switch (row.state) {
    case 'sent':
    case 'skipped':
      return { kind: 'stop', outcome: { kind: 'done', code: `already.${row.state}` } };
    case 'failed':
      return redriven
        ? send(0, row.unknownSends > 0)
        : { kind: 'stop', outcome: { kind: 'dead', code: 'already.failed' } };
    case 'deferred':
      return send(row.unknownSends, false);
    case 'sending':
    case 'unknown': {
      const unknownSends = row.unknownSends + (row.state === 'sending' ? 1 : 0);
      if (unknownSends < UNKNOWN_SENDS_CAP) return send(unknownSends, true);
      return {
        kind: 'fail',
        settlement: { state: 'failed', code: 'ambiguous', unknownSends },
        outcome: { kind: 'dead', code: 'ambiguous' },
      };
    }
  }
}
