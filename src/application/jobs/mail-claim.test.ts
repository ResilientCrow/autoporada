import { describe, expect, it } from 'vitest';

import type { LedgerRow, LedgerState } from '@/application/ports';

import { claimDecision, paceDecision } from './mail-claim';

/** The job that last claimed the row, and a job an operator revived from the dead letters. */
const DEAD_JOB = '7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const REVIVED_JOB = '1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b';

const row = (
  state: LedgerState,
  unknownSends = 0,
  claimed: Partial<Pick<LedgerRow, 'jobId' | 'capFrom'>> = {},
): LedgerRow => ({
  dedupeKey: 'access.approved:5d2e8a4b-1c3f-4e6a-8b9d-7f0a1c2e3b4d',
  template: 'access.approved',
  recipientId: '0b6f2c1e-6f1a-4c7e-9d4b-2a1f3e5c7d90',
  subjectId: '5d2e8a4b-1c3f-4e6a-8b9d-7f0a1c2e3b4d',
  state,
  unknownSends,
  capFrom: 0,
  jobId: DEAD_JOB,
  attempts: 1,
  claimedAt: new Date('2026-10-24T08:00:00Z'),
  settledAt: null,
  code: null,
  graphRequestId: null,
  ...claimed,
});

const send = (unknownSends: number, capFrom: number, resend: boolean) => ({
  kind: 'send',
  unknownSends,
  capFrom,
  resend,
});

const ambiguous = (unknownSends: number) => ({
  kind: 'fail',
  settlement: { state: 'failed', code: 'ambiguous', unknownSends },
  outcome: { kind: 'dead', code: 'ambiguous' },
});

/** The job that claimed the row runs again (a retry of the original job). */
const retry = (claimedRow: LedgerRow | null) =>
  claimDecision({ row: claimedRow, redriven: false, jobId: DEAD_JOB });
/** The revived job, before or after its own first claim (`row.jobId` tells which). */
const revival = (claimedRow: LedgerRow) =>
  claimDecision({ row: claimedRow, redriven: true, jobId: REVIVED_JOB });

describe('claimDecision', () => {
  it('claims and sends a key it has never seen', () => {
    expect(retry(null)).toEqual(send(0, 0, false));
  });

  it.each(['sent', 'skipped'] as const)(
    'sends nothing for a key already %s, redriven or not',
    (state) => {
      for (const decision of [retry(row(state)), revival(row(state))]) {
        expect(decision).toEqual({
          kind: 'stop',
          outcome: { kind: 'done', code: `already.${state}` },
        });
      }
    },
  );

  it('counts a row left sending (an attempt died unsettled) as one unknown and resends', () => {
    expect(retry(row('sending', 0))).toEqual(send(1, 0, true));
  });

  it('resends after one unknown outcome, which its settle already counted', () => {
    expect(retry(row('unknown', 1))).toEqual(send(1, 0, true));
  });

  it('gives up at two unknown outcomes: the row becomes failed, the job dead', () => {
    expect(retry(row('unknown', 2))).toEqual(ambiguous(2));
  });

  it('counts the unsettled attempt towards the cap', () => {
    expect(retry(row('sending', 1))).toEqual(ambiguous(2));
  });

  // A job can be dead-lettered with its row still unknown or sending: its last allowed attempt
  // ended that way. The redrive is the operator's decision to try again, as for a failed row.
  it.each([
    ['unknown at the cap', row('unknown', 2), 2],
    ['left sending at the cap', row('sending', 1), 2],
    ['unknown below the cap', row('unknown', 1), 1],
  ])(
    'redrives a row %s with the cap counted from now, flagged: a copy may be out',
    (_what, deadRow, count) => {
      expect(revival(deadRow)).toEqual(send(count, count, true));
    },
  );

  it('revives on the first claim of the revived job, whichever attempt makes it', () => {
    // The revived job's attempt 1 ended before it claimed (a throw, a shutdown in a pacing
    // hold, an expiry): the row still names the dead job, so its next attempt is still revived.
    expect(revival(row('unknown', 2))).toEqual(send(2, 2, true));
    expect(revival(row('failed', 0))).toEqual(send(0, 0, false));
  });

  it('keeps the cap for the revived job once it has claimed: it counts from cap_from', () => {
    const own = { jobId: REVIVED_JOB, capFrom: 2 };
    expect(revival(row('unknown', 3, own))).toEqual(send(3, 2, true));
    expect(revival(row('unknown', 4, own))).toEqual(ambiguous(4));
    expect(revival(row('sending', 3, own))).toEqual(ambiguous(4));
    expect(revival(row('failed', 4, own))).toEqual({
      kind: 'stop',
      outcome: { kind: 'dead', code: 'already.failed' },
    });
  });

  it('claims a deferred row keeping its unknown count, as a resend when an earlier call may be out', () => {
    expect(retry(row('deferred', 0))).toEqual(send(0, 0, false));
    // unknown, then a 429 (deferred keeps the count): the next 202 may be a second copy
    expect(retry(row('deferred', 1))).toEqual(send(1, 0, true));
  });

  it('redrives a deferred row with the cap counted from now, flagged when a copy may be out', () => {
    // The dead job's last attempts were deferrals (auth.403 for hours) after one unknown send.
    expect(revival(row('deferred', 1))).toEqual(send(1, 1, true));
    expect(revival(row('deferred', 0))).toEqual(send(0, 0, false));
  });

  it('keeps a revived send a resend after it was deferred: the count is not reset', () => {
    const own = { jobId: REVIVED_JOB, capFrom: 2 };
    expect(revival(row('deferred', 2, own))).toEqual(send(2, 2, true));
  });

  it('redrives a failed ambiguous row with the cap counted from now, flagged: a copy may be out', () => {
    expect(revival(row('failed', 2))).toEqual(send(2, 2, true));
  });

  it('redrives a rejected row (no unknown outcomes) as a first send', () => {
    expect(revival(row('failed', 0))).toEqual(send(0, 0, false));
  });

  it('stops a plain retry that meets a failed row (its dead-lettering did not complete)', () => {
    expect(retry(row('failed', 2))).toEqual({
      kind: 'stop',
      outcome: { kind: 'dead', code: 'already.failed' },
    });
  });

  it('never lowers unknown_sends: it counts every possible copy, redrive or not', () => {
    const states = ['sending', 'unknown', 'deferred', 'failed'] as const;
    for (const state of states) {
      for (let count = 0; count <= 5; count += 1) {
        for (const capFrom of [0, Math.max(0, count - 1)]) {
          for (const jobId of [DEAD_JOB, REVIVED_JOB]) {
            const before = row(state, count, { jobId, capFrom });
            for (const decision of [retry(before), revival(before)]) {
              const after =
                decision.kind === 'send'
                  ? decision
                  : decision.kind === 'fail'
                    ? { unknownSends: decision.settlement.unknownSends ?? count, capFrom }
                    : null;
              if (!after) continue;
              expect(after.unknownSends).toBeGreaterThanOrEqual(count);
              if ('capFrom' in after) expect(after.capFrom).toBeLessThanOrEqual(after.unknownSends);
            }
          }
        }
      }
    }
  });
});

describe('paceDecision', () => {
  const NOW = new Date('2026-10-24T08:00:00Z');
  const at = (ms: number) => new Date(NOW.getTime() + ms);
  const open = { notBefore: null, code: null };
  const calls = (count: number, oldest: Date | null = count > 0 ? at(-50_000) : null) => ({
    count,
    oldest,
  });

  it('lets a send through with the gate open and room in the window', () => {
    expect(paceDecision({ gate: open, calls: calls(19), now: NOW })).toBeNull();
    expect(
      paceDecision({ gate: { notBefore: NOW, code: 'auth.403' }, calls: calls(0), now: NOW }),
    ).toBeNull();
  });

  it('waits for a closed gate until it opens', () => {
    const gate = { notBefore: at(1), code: 'throttled.429' };
    expect(paceDecision({ gate, calls: calls(0), now: NOW })).toEqual({
      kind: 'wait',
      until: at(1),
      code: 'wait.gate',
    });
    expect(paceDecision({ gate, calls: calls(20), now: NOW })).toMatchObject({ code: 'wait.gate' });
  });

  it('waits with 20 sends in the last minute until the oldest leaves it', () => {
    expect(paceDecision({ gate: open, calls: calls(20), now: NOW })).toEqual({
      kind: 'wait',
      until: at(10_000),
      code: 'wait.window',
    });
  });
});
