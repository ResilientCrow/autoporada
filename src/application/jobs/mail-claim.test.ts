import { describe, expect, it } from 'vitest';

import type { LedgerRow, LedgerState } from '@/application/ports';

import { claimDecision, paceDecision } from './mail-claim';

const row = (state: LedgerState, unknownSends = 0): LedgerRow => ({
  dedupeKey: 'access.approved:5d2e8a4b-1c3f-4e6a-8b9d-7f0a1c2e3b4d',
  template: 'access.approved',
  recipientId: '0b6f2c1e-6f1a-4c7e-9d4b-2a1f3e5c7d90',
  subjectId: '5d2e8a4b-1c3f-4e6a-8b9d-7f0a1c2e3b4d',
  state,
  unknownSends,
  attempts: 1,
  claimedAt: new Date('2026-10-24T08:00:00Z'),
  settledAt: null,
  code: null,
  graphRequestId: null,
});

const ambiguous = (unknownSends: number) => ({
  kind: 'fail',
  settlement: { state: 'failed', code: 'ambiguous', unknownSends },
  outcome: { kind: 'dead', code: 'ambiguous' },
});

describe('claimDecision', () => {
  it('claims and sends a key it has never seen', () => {
    expect(claimDecision({ row: null, redriven: false })).toEqual({
      kind: 'send',
      unknownSends: 0,
      resend: false,
    });
  });

  it.each(['sent', 'skipped'] as const)(
    'sends nothing for a key already %s, redriven or not',
    (state) => {
      for (const redriven of [false, true]) {
        expect(claimDecision({ row: row(state), redriven })).toEqual({
          kind: 'stop',
          outcome: { kind: 'done', code: `already.${state}` },
        });
      }
    },
  );

  it('counts a row left sending (an attempt died unsettled) as one unknown and resends', () => {
    expect(claimDecision({ row: row('sending', 0), redriven: false })).toEqual({
      kind: 'send',
      unknownSends: 1,
      resend: true,
    });
  });

  it('resends after one unknown outcome, which its settle already counted', () => {
    expect(claimDecision({ row: row('unknown', 1), redriven: false })).toEqual({
      kind: 'send',
      unknownSends: 1,
      resend: true,
    });
  });

  it('gives up at two unknown outcomes: the row becomes failed, the job dead', () => {
    expect(claimDecision({ row: row('unknown', 2), redriven: false })).toEqual(ambiguous(2));
    expect(claimDecision({ row: row('unknown', 3), redriven: true })).toEqual(ambiguous(3));
  });

  it('counts the unsettled attempt towards the cap', () => {
    expect(claimDecision({ row: row('sending', 1), redriven: false })).toEqual(ambiguous(2));
  });

  it('claims a deferred row normally, keeping its unknown count', () => {
    expect(claimDecision({ row: row('deferred', 0), redriven: false })).toEqual({
      kind: 'send',
      unknownSends: 0,
      resend: false,
    });
    expect(claimDecision({ row: row('deferred', 1), redriven: false })).toEqual({
      kind: 'send',
      unknownSends: 1,
      resend: false,
    });
  });

  it('redrives a failed ambiguous row with the unknowns reset, flagged: a copy may be out', () => {
    expect(claimDecision({ row: row('failed', 2), redriven: true })).toEqual({
      kind: 'send',
      unknownSends: 0,
      resend: true,
    });
  });

  it('redrives a rejected row (no unknown outcomes) as a first send', () => {
    expect(claimDecision({ row: row('failed', 0), redriven: true })).toEqual({
      kind: 'send',
      unknownSends: 0,
      resend: false,
    });
  });

  it('stops a plain retry that meets a failed row (its dead-lettering did not complete)', () => {
    expect(claimDecision({ row: row('failed', 2), redriven: false })).toEqual({
      kind: 'stop',
      outcome: { kind: 'dead', code: 'already.failed' },
    });
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
