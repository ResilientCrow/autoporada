import { describe, expect, it } from 'vitest';

import { isFreshAuth, requiresStepUp, STEP_UP_ACTIONS, STEP_UP_MAX_AGE_MS } from './index';
import type { Action } from './index';

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

describe('requiresStepUp', () => {
  it('is exactly STEP_UP_ACTIONS', () => {
    expect(STEP_UP_ACTIONS.every(requiresStepUp)).toBe(true);
    expect(STEP_UP_ACTIONS).toEqual(['users.manage', 'registry.newSchoolYear']);
  });

  it('does not ask for it when only viewing users or deciding a request', () => {
    for (const action of [
      'users.view',
      'access.decide',
      'issue.edit',
    ] as const satisfies readonly Action[]) {
      expect(requiresStepUp(action)).toBe(false);
    }
  });
});
