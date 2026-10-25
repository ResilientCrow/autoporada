import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  calDate,
  compareDates,
  daysBetween,
  instantToWallClock,
  isoWeekday,
  mondayOf,
  parseIsoDate,
  parseWallTime,
  toIsoDate,
  toIsoTime,
  wallClockToInstant,
  wallTime,
} from './index';

const d = parseIsoDate;
const t = parseWallTime;
const arbDate = fc
  .date({
    min: new Date('1950-01-01T00:00:00Z'),
    max: new Date('2150-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((x) => calDate(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()));

describe('CalDate', () => {
  it.each([
    [2026, 2, 29],
    [2026, 13, 1],
    [2026, 4, 31],
    [1899, 12, 31],
    [2026.5, 1, 1],
  ])('rejects %i-%i-%i', (y, m, day) => {
    expect(() => calDate(y, m, day)).toThrow(RangeError);
  });

  it('accepts leap days', () => {
    expect(toIsoDate(calDate(2028, 2, 29))).toBe('2028-02-29');
  });

  it.each(['2026-1-05', '20261005', '2026-10-05T00:00', ' 2026-10-05'])(
    'rejects ISO text %j',
    (s) => {
      expect(() => parseIsoDate(s)).toThrow(RangeError);
    },
  );

  it.each([
    ['2026-10-24', 1, '2026-10-25'],
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-12-28', 7, '2027-01-04'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('%s + %i days = %s, also across DST and years', (from, n, to) => {
    expect(toIsoDate(addDays(d(from), n))).toBe(to);
  });

  it.each([
    ['2026-10-12', 1],
    ['2026-10-14', 3],
    ['2026-10-18', 7],
    ['1970-01-01', 4],
  ])('%s is ISO weekday %i', (s, weekday) => {
    expect(isoWeekday(d(s))).toBe(weekday);
  });

  it.each([
    ['2026-10-12', '2026-10-12'],
    ['2026-10-18', '2026-10-12'],
    ['2027-01-03', '2026-12-28'],
  ])('the Monday of the week of %s is %s', (s, monday) => {
    expect(toIsoDate(mondayOf(d(s)))).toBe(monday);
  });

  it('round-trips ISO text and day arithmetic (property)', () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -4000, max: 4000 }), (date, n) => {
        expect(parseIsoDate(toIsoDate(date))).toEqual(date);
        expect(addDays(addDays(date, n), -n)).toEqual(date);
        expect(daysBetween(date, addDays(date, n))).toBe(n);
        expect(compareDates(date, addDays(date, n))).toBe(-Math.sign(n) || 0);
        expect(isoWeekday(mondayOf(date))).toBe(1);
      }),
    );
  });
});

describe('WallTime', () => {
  it.each(['9:05', '09:05', '23:59', '0:00'])('parses %s', (s) => {
    expect(() => parseWallTime(s)).not.toThrow();
  });

  it.each(['24:00', '9:5', '9.05', '12:60', 'noon'])('rejects %s', (s) => {
    expect(() => parseWallTime(s)).toThrow(RangeError);
  });

  it('writes two-digit hours and minutes that parse back', () => {
    expect(toIsoTime(wallTime(9, 5))).toBe('09:05');
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
        expect(parseWallTime(toIsoTime(wallTime(h, m)))).toEqual(wallTime(h, m));
      }),
    );
  });
});

describe('Prague wall clock', () => {
  it.each([
    ['2026-10-18', '18:00', '2026-10-18T16:00:00.000Z', 'summer time (+2)'],
    ['2026-10-25', '18:00', '2026-10-25T17:00:00.000Z', 'the day DST ends (+1)'],
    ['2027-03-28', '18:00', '2027-03-28T16:00:00.000Z', 'the day DST starts (+2)'],
    ['2026-12-31', '23:30', '2026-12-31T22:30:00.000Z', 'winter time (+1)'],
    ['2027-03-28', '02:30', '2027-03-28T01:30:00.000Z', 'spring gap: shifted forward to 03:30'],
    ['2026-10-25', '02:30', '2026-10-25T00:30:00.000Z', 'autumn overlap: earlier occurrence'],
    ['1980-04-06', '02:30', '1980-04-06T01:30:00.000Z', 'historic April gap (pre-1981 rule)'],
  ])('%s %s → %s (%s)', (date, time, iso) => {
    expect(wallClockToInstant(d(date), t(time)).toISOString()).toBe(iso);
  });

  it('reads instants back as Prague dates and times', () => {
    expect(instantToWallClock(new Date('2026-10-25T00:30:00Z'))).toEqual({
      date: d('2026-10-25'),
      time: t('2:30'),
    });
    expect(instantToWallClock(new Date('2026-12-31T23:30:00Z'))).toEqual({
      date: d('2027-01-01'),
      time: t('0:30'),
    });
  });

  it('round-trips every existing wall-clock minute (property)', () => {
    fc.assert(
      fc.property(
        arbDate,
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (date, h, m) => {
          const inGap = h === 2 && isoWeekday(date) === 7 && date.month === 3 && date.day >= 25;
          fc.pre(!inGap);
          const time = parseWallTime(`${h}:${String(m).padStart(2, '0')}`);
          expect(instantToWallClock(wallClockToInstant(date, time))).toEqual({ date, time });
        },
      ),
    );
  });
});
