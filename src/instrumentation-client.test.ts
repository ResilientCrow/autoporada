import { afterEach, describe, expect, it } from 'vitest';

import { clampMeasureEnd } from './instrumentation-client';

// Node's measure refuses a negative timestamp the way the browser does.
const guarded = () => {
  const perf = { measure: performance.measure.bind(performance) };
  clampMeasureEnd(perf);
  return perf;
};

afterEach(() => {
  performance.clearMeasures();
  performance.clearMarks();
});

describe('clampMeasureEnd', () => {
  it('measures an entry whose end fell below zero as ending at zero', () => {
    const detail = { devtools: { color: 'error' } };
    const entry = guarded().measure('errored', { start: 0, end: -21_600_000, detail });
    expect(entry.startTime).toBe(0);
    expect(entry.duration).toBe(0);
    expect(entry.detail).toEqual(detail);
  });

  it('leaves every other measure as it was', () => {
    const perf = guarded();
    expect(perf.measure('span', { start: 1, end: 3 }).duration).toBe(2);
    performance.mark('from');
    performance.mark('to');
    expect(perf.measure('marks', 'from', 'to').name).toBe('marks');
    expect(() => perf.measure('missing', 'nowhere')).toThrow();
  });
});
