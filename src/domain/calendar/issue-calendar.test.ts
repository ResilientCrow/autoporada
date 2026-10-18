import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  isoWeekday,
  parseIsoDate as d,
  parseWallTime as t,
  toIsoDate,
} from '@/domain/time';

import {
  deadline,
  eventEndedBefore,
  issuePhase,
  routeFutureItem,
  targetMonday,
  type FutureKind,
} from './index';

describe('deadline', () => {
  it.each([
    ['2026-10-19', '2026-10-18T16:00:00.000Z'],
    ['2026-10-26', '2026-10-25T17:00:00.000Z'],
    ['2027-03-29', '2027-03-28T16:00:00.000Z'],
  ])('issue %s closes at %s (Sunday 18:00 Prague, across DST)', (monday, iso) => {
    expect(deadline(d(monday)).toISOString()).toBe(iso);
  });

  it('follows a configured rule', () => {
    const friday = { dayOffset: -3, time: t('12:00') };
    expect(deadline(d('2026-10-19'), friday).toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });

  it('refuses a day that is not a Monday', () => {
    expect(() => deadline(d('2026-10-20'))).toThrow(RangeError);
  });
});

describe('targetMonday', () => {
  it.each([
    ['2026-10-18T15:59:00Z', '2026-10-19', 'Sunday 17:59 → tomorrow'],
    ['2026-10-18T16:00:00Z', '2026-10-26', 'Sunday 18:00 sharp → next week'],
    ['2026-10-19T08:00:00Z', '2026-10-26', 'meeting Monday → next week'],
    ['2026-10-14T10:00:00Z', '2026-10-19', 'mid-week → coming Monday'],
    ['2026-12-27T20:00:00Z', '2027-01-04', 'across the new year'],
  ])('%s → %s (%s)', (now, monday) => {
    expect(toIsoDate(targetMonday(new Date(now)))).toBe(monday);
  });

  it('always returns the first Monday whose deadline is still ahead (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (now) => {
          const monday = targetMonday(now);
          expect(isoWeekday(monday)).toBe(1);
          expect(now.getTime()).toBeLessThan(deadline(monday).getTime());
          expect(now.getTime()).toBeGreaterThanOrEqual(deadline(addDays(monday, -7)).getTime());
        },
      ),
    );
  });
});

describe('issuePhase', () => {
  const closes = new Date('2026-10-18T16:00:00Z');
  it('collects before the deadline and reviews from it on', () => {
    expect(issuePhase(new Date('2026-10-18T15:59:59Z'), closes)).toBe('collecting');
    expect(issuePhase(closes, closes)).toBe('review');
  });
});

describe('routeFutureItem (issue of 12 October 2026)', () => {
  const M = d('2026-10-12');
  const item = (kind: FutureKind, date: string, endDate?: string) => ({
    kind,
    date: d(date),
    ...(endDate && { endDate: d(endDate) }),
  });

  it.each([
    [item('jednani', '2026-10-12'), 'meetings'],
    [item('jednani', '2026-10-19'), 'meetings'],
    [item('jednani', '2026-10-20'), 'hidden'],
    [item('jednani', '2026-10-09'), 'hidden'],
    [item('jednani', '2026-10-10', '2026-10-13'), 'meetings'],
    [item('akce', '2026-10-26'), 'events'],
    [item('akce', '2026-10-27'), 'later'],
    [item('akce', '2026-10-08', '2026-10-12'), 'events'],
    [item('akce', '2026-10-11'), 'hidden'],
    [item('akce', '2026-12-01'), 'later'],
  ])('%o → %s', (future, slot) => {
    expect(routeFutureItem(future, M)).toBe(slot);
  });
});

describe('inverted date ranges', () => {
  it('are refused instead of being routed or published wrongly', () => {
    const backwards = { kind: 'akce' as const, date: d('2026-10-20'), endDate: d('2026-10-18') };
    expect(() => routeFutureItem(backwards, d('2026-10-19'))).toThrow(RangeError);
    expect(() => eventEndedBefore(backwards, d('2026-10-19'))).toThrow(RangeError);
  });
});

describe('eventEndedBefore', () => {
  it('admits a report only once the event is over before the meeting', () => {
    const M = d('2026-10-19');
    expect(eventEndedBefore({ date: d('2026-10-18') }, M)).toBe(true);
    expect(eventEndedBefore({ date: d('2026-10-19') }, M)).toBe(false);
    expect(eventEndedBefore({ date: d('2026-10-16'), endDate: d('2026-10-20') }, M)).toBe(false);
  });
});
