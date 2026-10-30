import { describe, expect, it } from 'vitest';

import { dateEcho, pickedDate, pickedTime, typedDate } from './dates';

describe('pickedDate', () => {
  it('takes a valid ISO date as it is', () => {
    expect(pickedDate('2027-01-14', null)).toBe('2027-01-14');
  });

  it('turns a cleared field into null', () => {
    expect(pickedDate('', '2027-01-14')).toBeNull();
  });

  it.each(['20270-01-14', '2027-02-30', '0000-01-01', '2027-1-4', 'abc'])(
    'keeps the current date for %j, which the server would refuse',
    (value) => {
      expect(pickedDate(value, '2027-01-14')).toBe('2027-01-14');
    },
  );
});

describe('typedDate', () => {
  // Chromium reports the year of a date key by key, once day and month are set.
  const KEYSTROKES = ['0002-01-14', '0020-01-14', '0202-01-14', '2027-01-14'];

  it('shows what was typed, whether or not the server would take it', () => {
    for (const raw of KEYSTROKES) expect(typedDate(raw, '2027-01-14').shown).toBe(raw);
    expect(typedDate('2027-02-30', null).shown).toBe('2027-02-30');
  });

  it('keeps the previous date in the content while the year is half typed', () => {
    expect(typedDate('0020-01-14', '2026-01-14').value).toBe('2026-01-14');
    expect(typedDate('0020-01-14', null).value).toBeNull();
  });

  it('takes the date once it is complete', () => {
    expect(typedDate('2027-01-14', '2026-01-14').value).toBe('2027-01-14');
  });

  it('clears the content with the field', () => {
    expect(typedDate('', '2027-01-14')).toEqual({ shown: '', value: null });
  });

  it('is echoed only once it is a date', () => {
    expect(KEYSTROKES.map((raw) => dateEcho(typedDate(raw, null).shown))).toEqual([
      null,
      null,
      null,
      'čtvrtek 14. ledna 2027',
    ]);
  });
});

describe('pickedTime', () => {
  it('takes HH:MM as it is', () => {
    expect(pickedTime('07:30', null)).toBe('07:30');
  });

  it('turns a cleared field into null', () => {
    expect(pickedTime('', '07:30')).toBeNull();
  });

  it.each(['24:00', '7:30', '07:30:15', '12:60', 'abc'])(
    'keeps the current time for %j',
    (value) => {
      expect(pickedTime(value, '07:30')).toBe('07:30');
    },
  );
});

describe('dateEcho', () => {
  it('writes the weekday and the date in words', () => {
    expect(dateEcho('2027-01-14')).toBe('čtvrtek 14. ledna 2027');
    expect(dateEcho('2026-10-25')).toBe('neděle 25. října 2026');
  });

  it.each([null, '', '2027-02-30', '20270-01-14', 'abc'])('says nothing for %j', (value) => {
    expect(dateEcho(value)).toBeNull();
  });
});
