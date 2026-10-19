import { describe, expect, it } from 'vitest';

import { isFreshAuth, STEP_UP_MAX_AGE_MS } from './index';

describe('isFreshAuth', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it.each([
    ['just now', 0, true],
    ['exactly 10 minutes ago', STEP_UP_MAX_AGE_MS, true],
    ['a millisecond too long ago', STEP_UP_MAX_AGE_MS + 1, false],
    ['a minute in the future (clock skew)', -60_000, true],
    ['further in the future', -60_001, false],
  ])('%s', (_name, age, fresh) => {
    expect(isFreshAuth(ago(age), now)).toBe(fresh);
  });
});
