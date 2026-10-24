import { describe, expect, it } from 'vitest';

import { retryAfterMs } from './index';

const NOW = new Date('2026-10-24T08:00:00Z');

describe('Retry-After', () => {
  it.each<[string | null, number, string]>([
    ['10', 10_000, 'whole seconds'],
    ['0', 1_000, 'zero, raised to the floor of 1 s'],
    ['3600', 900_000, 'an hour, clamped to 15 min'],
    ['-5', 30_000, 'a negative number: garbage'],
    ['1e3', 30_000, 'an exponent: garbage'],
    ['10.5', 30_000, 'a fraction: garbage'],
    ['', 30_000, 'empty'],
    ['abc', 30_000, 'text'],
    [null, 30_000, 'missing'],
    ['Sat, 24 Oct 2026 08:00:07 GMT', 7_000, 'an HTTP-date 7 s ahead'],
    ['Sat, 24 Oct 2026 07:59:00 GMT', 1_000, 'an HTTP-date in the past'],
    ['Sun, 25 Oct 2026 08:00:00 GMT', 900_000, 'an HTTP-date a day ahead'],
    ['2026-10-24T08:00:07Z', 30_000, 'an ISO date, which is not an HTTP-date'],
  ])('reads %j as %d ms (%s)', (header, ms) => {
    expect(retryAfterMs(header, NOW)).toBe(ms);
  });
});
