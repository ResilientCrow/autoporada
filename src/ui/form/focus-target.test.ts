import { describe, expect, it } from 'vitest';

import { firstPresent, shouldMoveFocus } from './focus-target';

describe('shouldMoveFocus', () => {
  it.each([
    [{ rose: true, focusedGone: false, focusDropped: false }, true],
    [{ rose: false, focusedGone: true, focusDropped: true }, true],
    [{ rose: false, focusedGone: true, focusDropped: false }, false],
    [{ rose: false, focusedGone: false, focusDropped: true }, false],
    [{ rose: false, focusedGone: false, focusDropped: false }, false],
  ])('%o → %s', (state, move) => {
    expect(shouldMoveFocus(state)).toBe(move);
  });
});

describe('firstPresent', () => {
  it('takes the first candidate on the page, skipping the gone ones', () => {
    expect(firstPresent([{ current: null }, { current: 'role' }, { current: 'title' }])).toBe(
      'role',
    );
  });

  it('is null when none is on the page', () => {
    expect(firstPresent([{ current: null }, { current: null }])).toBeNull();
  });
});
