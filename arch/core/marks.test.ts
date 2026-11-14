import { describe, expect, it } from 'vitest';
import type { FutureState, PointState } from '@/domain/review';
import { futureMark, pointMark } from './marks';

const POINTS: [PointState, string][] = [['draft', 'o'], ['submitted', 'o'], ['returned', 'n'], ['approved', 'c'], ['published', 'c'], ['rejected', 'x'], ['withdrawn', 'o']];
const FUTURES: [FutureState, string][] = [['draft', 'o'], ['submitted', 'o'], ['returned', 'n'], ['approved', 'c'], ['rejected', 'x'], ['cancelled', 'z'], ['withdrawn', 'o']];

describe('Přehled marks each of the author’s things by where it is', () => {
  it.each(POINTS)('a point %s shows %s', (state, mark) => {
    expect(pointMark({ state })).toBe(mark);
  });

  it.each(FUTURES)('an akce or jednání %s shows %s', (state, mark) => {
    expect(futureMark({ state })).toBe(mark);
  });

  it('shows a cancelled akce apart from a draft and from a refusal', () => {
    expect(futureMark({ state: 'cancelled' })).not.toBe(futureMark({ state: 'draft' }));
    expect(futureMark({ state: 'cancelled' })).not.toBe(futureMark({ state: 'rejected' }));
  });

  it('shows a refused akce as a refused report is shown', () => {
    expect(futureMark({ state: 'rejected' })).toBe(pointMark({ state: 'rejected' }));
  });
});
