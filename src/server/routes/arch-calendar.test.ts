import { describe, expect, it } from 'vitest';

import { calDate, toIsoDate, type CalDate } from '@/domain/time';

import { poradaMondayOf } from './arch-calendar';

const porada = (monday: CalDate, status: 'open' | 'generated' = 'open') => ({ monday, status });
const DROPPED = calDate(2026, 11, 9);
const at = (handIn: CalDate, published: boolean, poradas: ReturnType<typeof porada>[]) =>
  toIsoDate(poradaMondayOf(handIn, published, poradas));

describe('the porada a point is in, as Arch matches it (ADR 0054, 0029)', () => {
  it('is the hand-in Monday while that porada is open, stored or virtual', () => {
    expect(at(DROPPED, false, [porada(calDate(2026, 11, 2), 'generated'), porada(DROPPED)])).toBe(
      '2026-11-09',
    );
  });

  it('after a drop is the next open porada, where the cumulative rule prints the point', () => {
    const poradas = [porada(calDate(2026, 11, 2)), porada(calDate(2026, 11, 16))];
    expect(at(DROPPED, false, poradas)).toBe('2026-11-16');
  });

  it('steps over a generated porada for a point not yet printed', () => {
    const poradas = [porada(calDate(2026, 11, 16), 'generated'), porada(calDate(2026, 11, 23))];
    expect(at(DROPPED, false, poradas)).toBe('2026-11-23');
    expect(at(calDate(2026, 11, 16), false, poradas)).toBe('2026-11-23');
  });

  it('is the generated porada that printed a published point, after a drop too', () => {
    const poradas = [porada(calDate(2026, 11, 16), 'generated'), porada(calDate(2026, 11, 23))];
    expect(at(calDate(2026, 11, 16), true, poradas)).toBe('2026-11-16');
    expect(at(DROPPED, true, poradas)).toBe('2026-11-16');
  });

  it('keeps the hand-in Monday when no porada follows (past the calendar’s horizon)', () => {
    expect(at(DROPPED, false, [porada(calDate(2026, 11, 2))])).toBe('2026-11-09');
    expect(at(DROPPED, true, [])).toBe('2026-11-09');
  });
});
