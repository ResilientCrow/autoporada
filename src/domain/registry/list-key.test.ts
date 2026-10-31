import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';

import { archiveYears, listKeyFor } from './index';

describe('listKeyFor', () => {
  const none = new Set<string>();

  it.each([
    ['Němčina – certifikáty', 'nemcina-certifikaty'],
    ['  Příliš žluťoučký kůň!  ', 'prilis-zlutoucky-kun'],
    ['Angličtina 2026/27', 'anglictina-2026-27'],
  ])('makes %j into %j', (title, key) => {
    expect(listKeyFor(title, none)).toBe(key);
  });

  it('gives „seznam“ for a title with no letters or digits', () => {
    expect(listKeyFor('— ! —', none)).toBe('seznam');
  });

  it('appends a number until the key is free', () => {
    expect(listKeyFor('Talent', new Set(['talent']))).toBe('talent-2');
    expect(listKeyFor('Talent', new Set(['talent', 'talent-2', 'talent-3']))).toBe('talent-4');
  });

  it('stays within the 40 characters of the key CHECK, number included', () => {
    const long = 'Dlouhý název seznamu '.repeat(10);
    const first = listKeyFor(long, none);
    const second = listKeyFor(long, new Set([first]));
    for (const key of [first, second]) {
      expect(key.length).toBeLessThanOrEqual(40);
      expect(key).toMatch(/^[a-z0-9-]{1,40}$/);
    }
    expect(second).not.toBe(first);
  });
});

describe('archiveYears', () => {
  it('offers the year before and the current one', () => {
    expect(archiveYears(calDate(2026, 11, 3)).options).toEqual(['2025/2026', '2026/2027']);
    expect(archiveYears(calDate(2027, 2, 3)).options).toEqual(['2025/2026', '2026/2027']);
  });

  it('puts the year that just ended first in September and October, the current one otherwise', () => {
    expect(archiveYears(calDate(2026, 9, 1)).initial).toBe('2025/2026');
    expect(archiveYears(calDate(2026, 10, 31)).initial).toBe('2025/2026');
    expect(archiveYears(calDate(2026, 11, 1)).initial).toBe('2026/2027');
    expect(archiveYears(calDate(2026, 8, 31)).initial).toBe('2025/2026');
    expect(archiveYears(calDate(2027, 6, 30)).initial).toBe('2026/2027');
  });
});
