import { describe, expect, it } from 'vitest';

import { firstPresent, revealSteps, shouldMoveFocus } from './focus-target';

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

describe('revealSteps', () => {
  it.each([
    [
      { closedDetails: 0, inHiddenPane: false },
      { openDetails: 0, showForm: false },
    ],
    [
      { closedDetails: 1, inHiddenPane: false },
      { openDetails: 1, showForm: false },
    ],
    [
      { closedDetails: 3, inHiddenPane: false },
      { openDetails: 3, showForm: false },
    ],
    [
      { closedDetails: 0, inHiddenPane: true },
      { openDetails: 0, showForm: true },
    ],
    [
      { closedDetails: 2, inHiddenPane: true },
      { openDetails: 2, showForm: true },
    ],
  ])('%o → %o', (state, steps) => {
    expect(revealSteps(state)).toEqual(steps);
  });

  it('never opens a negative or fractional number of details', () => {
    expect(revealSteps({ closedDetails: -1, inHiddenPane: false }).openDetails).toBe(0);
    expect(revealSteps({ closedDetails: Number.NaN, inHiddenPane: false }).openDetails).toBe(0);
    expect(revealSteps({ closedDetails: 1.9, inHiddenPane: false }).openDetails).toBe(1);
  });
});
