import { describe, expect, it } from 'vitest';

import {
  ACCESS_COOLDOWN_DAYS,
  cooldownEnd,
  requestStanding,
  type AccessHistoryItem,
  type RequestStanding,
} from './index';
import type { AccessState } from './states';

const at = (iso: string) => new Date(iso);
const item = (
  id: string,
  state: AccessState,
  createdAt = '2026-10-01T08:00:00Z',
  decidedAt: string | null = state === 'pending' ? null : '2026-10-02T08:00:00Z',
): AccessHistoryItem => ({
  id,
  state,
  createdAt: at(createdAt),
  decidedAt: decidedAt ? at(decidedAt) : null,
});

describe('cooldownEnd', () => {
  it('is 30 days', () => {
    expect(ACCESS_COOLDOWN_DAYS).toBe(30);
  });

  it.each([
    ['plain winter day', '2026-01-10T09:00:00Z', '2026-02-08T23:00:00Z'],
    [
      'decision the day before DST ends (25 Oct 2026)',
      '2026-10-24T10:00:00Z',
      '2026-11-22T23:00:00Z',
    ],
    [
      'decision the day before DST starts (28 Mar 2027)',
      '2027-03-27T10:00:00Z',
      '2027-04-25T22:00:00Z',
    ],
    ['23:59:59 Prague on the decision day', '2026-10-24T21:59:59Z', '2026-11-22T23:00:00Z'],
    ['00:00 Prague on the next day', '2026-10-24T22:00:00Z', '2026-11-23T23:00:00Z'],
  ])('%s', (_name, decided, end) => {
    expect(cooldownEnd(at(decided))).toEqual(at(end));
  });
});

describe('requestStanding', () => {
  const now = at('2026-10-20T12:00:00Z');

  it.each<[string, readonly AccessHistoryItem[], RequestStanding]>([
    ['no history', [], { kind: 'open', previous: null }],
    ['approved only', [item('a', 'approved')], { kind: 'open', previous: null }],
    [
      'cancelled starts no cooldown',
      [item('a', 'cancelled')],
      { kind: 'open', previous: 'cancelled' },
    ],
    ['pending', [item('a', 'pending')], { kind: 'pending', requestId: 'a' }],
    ['blocked', [item('a', 'blocked')], { kind: 'blocked', decidedAt: at('2026-10-02T08:00:00Z') }],
    [
      'blocked beats pending',
      [item('b', 'pending'), item('a', 'blocked')],
      { kind: 'blocked', decidedAt: at('2026-10-02T08:00:00Z') },
    ],
    [
      'pending beats a rejection in cooldown',
      [item('b', 'pending'), item('a', 'rejected')],
      { kind: 'pending', requestId: 'b' },
    ],
    [
      'rejected, still cooling down',
      [item('a', 'rejected')],
      {
        kind: 'cooldown',
        decidedAt: at('2026-10-02T08:00:00Z'),
        until: at('2026-10-31T23:00:00Z'),
      },
    ],
    [
      'rejected, cooldown over',
      [item('a', 'rejected', '2026-08-01T08:00:00Z', '2026-08-02T08:00:00Z')],
      { kind: 'open', previous: 'rejected' },
    ],
    [
      'cancelled after a rejection ignores the cooldown',
      [item('b', 'cancelled'), item('a', 'rejected')],
      { kind: 'open', previous: 'cancelled' },
    ],
    [
      'approved after a rejection ignores the cooldown',
      [item('b', 'approved'), item('a', 'rejected')],
      { kind: 'open', previous: null },
    ],
  ])('%s', (_name, history, expected) => {
    expect(requestStanding(history, now)).toEqual(expected);
  });

  it('ends the cooldown exactly at Prague midnight', () => {
    const history = [item('a', 'rejected', '2026-10-01T08:00:00Z', '2026-10-24T21:59:59Z')];
    expect(requestStanding(history, at('2026-11-22T22:59:59Z')).kind).toBe('cooldown');
    expect(requestStanding(history, at('2026-11-22T23:00:00Z'))).toEqual({
      kind: 'open',
      previous: 'rejected',
    });
  });
});
