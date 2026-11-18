import { describe, expect, it } from 'vitest';

import type { FutureItemRecord } from '@/application/ports';
import type { FutureState, PointState } from '@/domain/review';
import { parseIsoDate } from '@/domain/time';

import {
  isLiveFuture,
  isLivePoint,
  lastGeneratedOf,
  liveFutures,
  liveSince,
  type LastPorada,
} from './arch-live';

const ME = 'viewer';
const OTHER = 'author';
/** The last generated porada: Monday 12 October, held on Thursday 15 October. */
const L: LastPorada = { monday: '2026-10-12', meetingDate: '2026-10-15' };

const AKCE = 'akce-live';
const LIVE_AKCE: ReadonlySet<string> = new Set([AKCE]);

const point = (state: PointState, akceId: string | null = null, authorId = OTHER) => ({
  authorId,
  state,
  akceId,
});

describe('isLivePoint', () => {
  it.each<[string, ReturnType<typeof point>, LastPorada | null, boolean]>([
    ['own draft', point('draft', null, ME), L, true],
    ['own withdrawn', point('withdrawn', null, ME), L, false],
    ['own withdrawn, no L', point('withdrawn', null, ME), null, false],
    ['own published', point('published', null, ME), L, true],
    ['own refused, no akce', point('rejected', null, ME), L, true],
    ['own refused report of an akce that is gone', point('rejected', 'akce-gone', ME), L, true],
    ['another submitted', point('submitted'), L, true],
    ['another returned', point('returned'), L, true],
    ['another approved', point('approved'), L, true],
    ['another withdrawn (submitted once)', point('withdrawn', AKCE), L, false],
    ['another refused point with no akce', point('rejected'), L, false],
    ['another refused report of a live akce', point('rejected', AKCE), L, true],
    ['another refused report of an akce no longer live', point('rejected', 'akce-gone'), L, false],
    ['another published point', point('published'), L, false],
    ['another published report of a live akce', point('published', AKCE), L, false],
    ['another draft', point('draft'), L, false],
    ['no L: another published', point('published'), null, true],
    ['no L: another refused, no akce', point('rejected'), null, true],
    ['no L: another withdrawn', point('withdrawn'), null, false],
  ])('%s', (_name, p, last, expected) => {
    expect(isLivePoint(p, ME, last, LIVE_AKCE)).toBe(expected);
  });

  it('keeps no refused point of another author when no akce is live', () => {
    expect(isLivePoint(point('rejected', AKCE), ME, L, new Set())).toBe(false);
  });
});

const future = (
  state: FutureState,
  lastDay: string | null,
  extra: { authorId?: string; cancelRequestedAt?: Date | null } = {},
) => ({ authorId: OTHER, state, lastDay, cancelRequestedAt: null, ...extra });
const ASKED = new Date('2026-10-01T10:00:00Z');

/** From when an item with nothing open is live, with today after the last porada was held. */
const SINCE = L.meetingDate;

describe('isLiveFuture', () => {
  it.each<[string, ReturnType<typeof future>, string | null, boolean]>([
    ['own draft, no date', future('draft', null, { authorId: ME }), SINCE, true],
    ['own withdrawn', future('withdrawn', '2026-10-20', { authorId: ME }), SINCE, false],
    [
      'own approved akce long past',
      future('approved', '2026-09-01', { authorId: ME }),
      SINCE,
      true,
    ],
    [
      'own cancelled akce long past',
      future('cancelled', '2026-09-01', { authorId: ME }),
      SINCE,
      true,
    ],
    ['another submitted, long past', future('submitted', '2026-09-01'), SINCE, true],
    ['another returned, no date', future('returned', null), SINCE, true],
    ['another withdrawn (submitted once)', future('withdrawn', '2026-10-20'), SINCE, false],
    ['another approved, ended before since', future('approved', '2026-10-14'), SINCE, false],
    ['another approved, ended on since', future('approved', '2026-10-15'), SINCE, true],
    ['another approved, ends after since', future('approved', '2026-10-16'), SINCE, true],
    [
      'another approved before since with a cancel request',
      future('approved', '2026-09-01', { cancelRequestedAt: ASKED }),
      SINCE,
      true,
    ],
    ['another approved with no date', future('approved', null), SINCE, false],
    ['another cancelled, ends after since', future('cancelled', '2026-10-20'), SINCE, true],
    ['another cancelled, before since', future('cancelled', '2026-09-01'), SINCE, false],
    ['another rejected, before since', future('rejected', '2026-09-01'), SINCE, false],
    ['no porada: another approved long past', future('approved', '2026-01-01'), null, true],
    ['no porada: another cancelled, no date', future('cancelled', null), null, true],
    ['no porada: another withdrawn', future('withdrawn', '2026-10-20'), null, false],
  ])('%s', (_name, f, since, expected) => {
    expect(isLiveFuture(f, ME, since)).toBe(expected);
  });
});

describe('liveSince', () => {
  it('is null before the first generated porada', () => {
    expect(liveSince(null, '2026-10-20')).toBeNull();
  });

  it('is today while the last generated porada is still to be held', () => {
    expect(liveSince(L, '2026-10-13')).toBe('2026-10-13');
  });

  it('is the meeting date once the porada was held', () => {
    expect(liveSince(L, '2026-10-20')).toBe('2026-10-15');
  });

  it('is the same day on the meeting day', () => {
    expect(liveSince(L, '2026-10-15')).toBe('2026-10-15');
  });
});

describe('a colleague’s approved akce around the last generated porada', () => {
  const record = (id: string, lastDay: string) =>
    ({
      id,
      authorId: OTHER,
      state: 'approved',
      cancelRequestedAt: null,
      content: { startDate: parseIsoDate(lastDay), endDate: null },
    }) as unknown as FutureItemRecord;
  const idsAt = (today: string, days: string[]) =>
    liveFutures(
      days.map((d) => record(d, d)),
      ME,
      liveSince(L, today),
    ).map((f) => f.id);

  it('keeps one not over yet between the generation and the meeting', () => {
    // Today is Tuesday 13 October; the porada generated on Monday is held on Thursday 15 October.
    expect(idsAt('2026-10-13', ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ]);
  });

  it('keeps one that ended since the meeting, which owes a report to the next porada', () => {
    expect(idsAt('2026-10-20', ['2026-10-14', '2026-10-15', '2026-10-18', '2026-10-20'])).toEqual([
      '2026-10-15',
      '2026-10-18',
      '2026-10-20',
    ]);
  });

  it('drops one that ended before the meeting once it was held', () => {
    expect(idsAt('2026-10-20', ['2026-10-14'])).toEqual([]);
  });
});

describe('lastGeneratedOf', () => {
  const row = (monday: string, meetingDate: string, status: string) => ({
    monday,
    meetingDate,
    status,
  });

  it('is the generated porada with the latest Monday, whatever the order', () => {
    expect(
      lastGeneratedOf([
        row('2026-10-19', '2026-10-22', 'open'),
        row('2026-10-12', '2026-10-15', 'generated'),
        row('2026-10-05', '2026-10-08', 'generated'),
      ]),
    ).toEqual({ monday: '2026-10-12', meetingDate: '2026-10-15' });
  });

  it('is null when none is generated', () => {
    expect(lastGeneratedOf([row('2026-10-19', '2026-10-22', 'open')])).toBeNull();
    expect(lastGeneratedOf([])).toBeNull();
  });
});
