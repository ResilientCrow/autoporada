import { describe, expect, it } from 'vitest';

import { addDays, parseIsoDate as d, parseWallTime as t } from '@/domain/time';

import {
  formatBulletTimeRange,
  formatLongDate,
  formatLongRange,
  formatNumericDate,
  formatNumericRange,
  formatProseTimeRange,
  formatTitleDate,
  formatWeekdayNumeric,
  formatWindow,
  onWeekday,
  schoolYear,
} from '../index';

describe('single dates', () => {
  it('formats the meeting title date', () => {
    expect(formatTitleDate(d('2026-10-12'))).toBe('pondělí 12. října 2026');
  });

  it.each([
    ['2026-01-05', '5. ledna 2026'],
    ['2026-02-02', '2. února 2026'],
    ['2026-03-02', '2. března 2026'],
    ['2026-04-06', '6. dubna 2026'],
    ['2026-05-04', '4. května 2026'],
    ['2026-06-01', '1. června 2026'],
    ['2026-07-06', '6. července 2026'],
    ['2026-08-03', '3. srpna 2026'],
    ['2026-09-07', '7. září 2026'],
    ['2026-10-12', '12. října 2026'],
    ['2026-11-02', '2. listopadu 2026'],
    ['2026-12-07', '7. prosince 2026'],
  ])('%s → %s', (iso, text) => {
    expect(formatLongDate(d(iso))).toBe(text);
  });

  it('formats numeric dates without leading zeros', () => {
    expect(formatNumericDate(d('2026-01-05'))).toBe('5. 1. 2026');
    expect(formatWeekdayNumeric(d('2026-10-19'))).toBe('pondělí 19. 10. 2026');
  });

  it.each([
    ['2026-10-12', 'V pondělí'],
    ['2026-10-13', 'V úterý'],
    ['2026-10-14', 'Ve středu'],
    ['2026-10-15', 'Ve čtvrtek'],
    ['2026-10-16', 'V pátek'],
    ['2026-10-17', 'V sobotu'],
    ['2026-10-18', 'V neděli'],
  ])('%s → %s', (iso, phrase) => {
    expect(onWeekday(d(iso), { capitalize: true })).toBe(phrase);
    expect(onWeekday(d(iso))).toBe(phrase.toLowerCase());
  });
});

describe('date ranges', () => {
  it.each([
    ['2026-10-27', '2026-10-29', '27.–29. 10. 2026', '27.–29. října 2026'],
    ['2026-10-30', '2026-11-02', '30. 10. – 2. 11. 2026', '30. října – 2. listopadu 2026'],
    ['2026-12-30', '2027-01-02', '30. 12. 2026 – 2. 1. 2027', '30. prosince 2026 – 2. ledna 2027'],
    ['2026-10-27', '2026-10-27', '27. 10. 2026', '27. října 2026'],
  ])('%s..%s', (from, to, numeric, long) => {
    expect(formatNumericRange(d(from), d(to))).toBe(numeric);
    expect(formatLongRange(d(from), d(to))).toBe(long);
  });

  it.each([
    ['2026-10-20', '2026-10-22', '20. až 22. října 2026'],
    ['2026-10-30', '2026-11-02', '30. října až 2. listopadu 2026'],
    ['2026-12-30', '2027-01-02', '30. prosince 2026 až 2. ledna 2027'],
  ])('writes %s..%s with „až“ for agenda bullets', (from, to, text) => {
    expect(formatLongRange(d(from), d(to), { joiner: 'až' })).toBe(text);
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => formatNumericRange(d('2026-10-29'), d('2026-10-27'))).toThrow(RangeError);
  });
});

describe('agenda windows', () => {
  it.each([
    ['2026-10-12', 7, 'od 12. října do 19. října 2026'],
    ['2026-10-12', 14, 'od 12. října do 26. října 2026'],
    ['2026-10-26', 7, 'od 26. října do 2. listopadu 2026'],
    ['2026-12-28', 7, 'od 28. prosince 2026 do 4. ledna 2027'],
    ['2026-12-21', 14, 'od 21. prosince 2026 do 4. ledna 2027'],
  ])('%s + %i days → %s', (monday, days, text) => {
    expect(formatWindow(d(monday), addDays(d(monday), days))).toBe(text);
  });
});

describe('times', () => {
  it('uses colons in bullets and dots in prose, hours without leading zeros', () => {
    expect(formatBulletTimeRange(t('10:00'), t('11:30'))).toBe('10:00 až 11:30');
    expect(formatBulletTimeRange(t('09:05'))).toBe('9:05');
    expect(formatProseTimeRange(t('10:00'), t('12:00'))).toBe('od 10.00 do 12.00 hodin');
    expect(formatProseTimeRange(t('8:30'))).toBe('od 8.30 hodin');
  });
});

describe('school year', () => {
  it.each([
    ['2026-08-31', '2025/2026'],
    ['2026-09-01', '2026/2027'],
    ['2027-06-30', '2026/2027'],
    ['2026-12-31', '2026/2027'],
  ])('%s is in %s', (iso, year) => {
    expect(schoolYear(d(iso))).toBe(year);
  });
});
