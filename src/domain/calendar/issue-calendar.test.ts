import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  instantToWallClock,
  parseIsoDate as d,
  parseWallTime as t,
  toIsoDate,
} from '@/domain/time';

import {
  deadline,
  eventEndedBefore,
  eventsWindow,
  issuePhase,
  meetingsWindow,
  routeFutureItem,
  slotMondayOf,
  type DateRange,
  type FutureKind,
} from './index';

describe('deadline', () => {
  it.each([
    ['2026-10-19', '2026-10-17T18:00:00.000Z', 'Saturday 20.00 for a Monday meeting'],
    ['2026-10-26', '2026-10-24T18:00:00.000Z', 'Saturday 24 October, still summer time'],
    ['2027-03-29', '2027-03-27T19:00:00.000Z', 'Saturday 27 March, still winter time'],
  ])('meeting %s closes at %s (%s)', (meeting, iso) => {
    expect(deadline(d(meeting)).toISOString()).toBe(iso);
  });

  it('is Monday 20.00 for a Wednesday meeting', () => {
    expect(deadline(d('2026-10-21')).toISOString()).toBe('2026-10-19T18:00:00.000Z');
  });

  it.each([
    [
      '2026-10-26',
      '2026-10-24T18:00:00.000Z',
      'the Monday after the clocks go back: Saturday before it, CEST',
    ],
    ['2026-10-27', '2026-10-25T19:00:00.000Z', 'Sunday 25 October itself, 20.00 is already CET'],
    [
      '2027-03-29',
      '2027-03-27T19:00:00.000Z',
      'the Monday after the clocks go forward: Saturday, CET',
    ],
    ['2027-03-30', '2027-03-28T18:00:00.000Z', 'Sunday 28 March itself, 20.00 is already CEST'],
  ])(
    'keeps 20.00 wall time over the DST weekends: meeting %s closes at %s (%s)',
    (meeting, iso) => {
      expect(deadline(d(meeting)).toISOString()).toBe(iso);
    },
  );

  it('counts back from the meeting date, whatever its weekday (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (day) => {
          const meeting = instantToWallClock(day).date;
          const { date, time } = instantToWallClock(deadline(meeting));
          expect(toIsoDate(date)).toBe(toIsoDate(addDays(meeting, -2)));
          expect(time).toEqual(t('20:00'));
        },
      ),
    );
  });

  it('follows a configured rule', () => {
    const friday = { dayOffset: -3, time: t('12:00') };
    expect(deadline(d('2026-10-19'), friday).toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });
});

describe('issuePhase', () => {
  const closes = new Date('2026-10-17T18:00:00Z');
  it('collects before the deadline and reviews from it on', () => {
    expect(issuePhase(new Date('2026-10-17T17:59:59Z'), closes)).toBe('collecting');
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

describe('the two agenda windows', () => {
  const range = (r: DateRange) => `${toIsoDate(r.from)}..${toIsoDate(r.to)}`;

  it.each([
    ['2026-10-12', '2026-10-12..2026-10-19', '2026-10-12..2026-10-26', 'a Monday porada'],
    ['2026-11-18', '2026-11-18..2026-11-23', '2026-11-18..2026-11-30', 'moved to Wednesday'],
    ['2026-11-19', '2026-11-19..2026-11-23', '2026-11-19..2026-11-30', 'moved to Thursday'],
    ['2026-10-29', '2026-10-29..2026-11-02', '2026-10-29..2026-11-09', 'across a month end'],
    ['2026-12-31', '2026-12-31..2027-01-04', '2026-12-31..2027-01-11', 'across a year end'],
    ['2026-09-25', '2026-09-25..2026-10-05', '2026-09-25..2026-10-12', 'Friday before its Monday'],
  ])('meeting %s: jednání %s, akce %s (%s)', (meeting, meetings, events) => {
    expect(range(meetingsWindow(d(meeting)))).toBe(meetings);
    expect(range(eventsWindow(d(meeting)))).toBe(events);
  });

  it('start at the meeting and end on the Monday one and two weeks after its slot (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (day) => {
          const meeting = instantToWallClock(day).date;
          const slot = slotMondayOf(meeting);
          expect(meetingsWindow(meeting)).toEqual({ from: meeting, to: addDays(slot, 7) });
          expect(eventsWindow(meeting)).toEqual({ from: meeting, to: addDays(slot, 14) });
        },
      ),
    );
  });
});

describe('routeFutureItem (porada moved to Wednesday 18 November 2026)', () => {
  const M = d('2026-11-18');
  it.each([
    ['jednani', '2026-11-17', 'hidden'],
    ['jednani', '2026-11-18', 'meetings'],
    ['jednani', '2026-11-23', 'meetings'],
    ['jednani', '2026-11-24', 'hidden'],
    ['akce', '2026-11-30', 'events'],
    ['akce', '2026-12-01', 'later'],
    ['akce', '2026-12-02', 'later'],
  ] as const)('%s on %s → %s', (kind, date, slot) => {
    expect(routeFutureItem({ kind, date: d(date) }, M)).toBe(slot);
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
