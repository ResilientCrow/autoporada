import { describe, expect, it } from 'vitest';

import { summaryDue } from './index';

/** Sunday 25 October 2026, 18.00 Prague: 17.00Z, the night the clocks go back. */
const DEADLINE = new Date('2026-10-25T17:00:00Z');
const MINUTE = 60_000;
const at = (offsetMs: number) => new Date(DEADLINE.getTime() + offsetMs);

describe('summaryDue', () => {
  it('opens five minutes after the deadline, and not a moment before', () => {
    expect(summaryDue(DEADLINE, at(0))).toBe(false);
    expect(summaryDue(DEADLINE, at(5 * MINUTE - 1))).toBe(false);
    expect(summaryDue(DEADLINE, at(5 * MINUTE))).toBe(true);
  });

  it('stays open for two hours after the deadline, and closes there', () => {
    expect(summaryDue(DEADLINE, at(120 * MINUTE - 1))).toBe(true);
    expect(summaryDue(DEADLINE, at(120 * MINUTE))).toBe(false);
  });

  it('is shut before the deadline and long after it', () => {
    expect(summaryDue(DEADLINE, at(-24 * 60 * MINUTE))).toBe(false);
    expect(summaryDue(DEADLINE, at(7 * 24 * 60 * MINUTE))).toBe(false);
  });
});
