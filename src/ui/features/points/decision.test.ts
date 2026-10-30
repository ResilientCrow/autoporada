import { describe, expect, it } from 'vitest';

import { afterDecision, barChoices, barClass, decidedEvent, decideInput } from './decision';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const NEXT = '1b0c1d2e-3f40-4152-8364-758697a8b9cb';
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

describe('the bar’s choices', () => {
  it('offers both approvals, the return and the reject', () => {
    expect(
      barChoices({ decisions: ['approve', 'return', 'reject'], othersApprove: false }),
    ).toEqual({
      approve: true,
      return: true,
      reject: true,
      ownPoint: false,
      edit: false,
      any: true,
    });
  });

  it('says a reviewer’s own point is approved by someone else, in place of „Schválit“', () => {
    expect(barChoices({ decisions: ['return', 'reject'], othersApprove: true })).toEqual({
      approve: false,
      return: true,
      reject: true,
      ownPoint: true,
      edit: false,
      any: true,
    });
  });

  it('offers nothing once nothing may be decided', () => {
    expect(barChoices({ decisions: [], othersApprove: false }).any).toBe(false);
  });

  it('offers „Upravit“ only where the page gives the editor, alone if need be', () => {
    expect(barChoices({ decisions: [], othersApprove: false }, true)).toMatchObject({
      edit: true,
      any: true,
    });
    expect(barChoices({ decisions: ['approve'], othersApprove: false }, false).edit).toBe(false);
  });
});

describe('what a press sends', () => {
  it('sends an approval without a note, whichever approval was pressed', () => {
    for (const decision of ['approve', 'approve-next']) {
      expect(decideInput(ID, 4, form({ decision, note: 'x' }))).toEqual({
        id: ID,
        expectedVersion: 4,
        event: 'approve',
      });
    }
  });

  it('sends a return or a reject with the note as typed (the server trims it)', () => {
    expect(decideInput(ID, 4, form({ decision: 'return', note: ' Doplňte. ' }))).toEqual({
      id: ID,
      expectedVersion: 4,
      event: 'return',
      note: ' Doplňte. ',
    });
    expect(decideInput(ID, 4, form({ decision: 'reject', note: '' }))).toMatchObject({
      event: 'reject',
      note: '',
    });
  });

  it('throws on a decision the bar does not offer', () => {
    expect(() => decideInput(ID, 4, form({ decision: 'publish' }))).toThrow();
  });
});

describe('where the reviewer goes after a decision', () => {
  it('stays on the point unless they asked to go on', () => {
    expect(afterDecision('approve', NEXT)).toBeNull();
    expect(afterDecision('return', NEXT)).toBeNull();
  });

  it('opens the next point, or the queue when none waits', () => {
    expect(afterDecision('approve-next', NEXT)).toBe(`/kontrola/${NEXT}`);
    expect(afterDecision('approve-next', null)).toBe('/kontrola');
  });
});

describe('what the reviewer hears after a decision', () => {
  it('names the decision, „Schválit a pokračovat“ as an approval', () => {
    expect(decidedEvent('approve')).toBe('approve');
    expect(decidedEvent('approve-next')).toBe('approve');
    expect(decidedEvent('return')).toBe('return');
    expect(decidedEvent('reject')).toBe('reject');
  });
});

describe('where the bar sits', () => {
  const sticky = (classes: string) => classes.split(' ').filter((c) => /sticky|bottom-0/.test(c));

  it('sticks to the bottom only from md on, while the note is closed', () => {
    expect(sticky(barClass(null))).toEqual(['md:sticky', 'md:bottom-0']);
  });

  it('sits in the flow once the note is open, at every width', () => {
    expect(sticky(barClass('return'))).toEqual([]);
    expect(sticky(barClass('reject'))).toEqual([]);
  });

  it('keeps the submit bar’s marker and look either way', () => {
    for (const noted of [null, 'return'] as const) {
      expect(barClass(noted)).toMatch(/^submit-bar border-t-2 border-ink bg-light py-3/);
    }
  });
});
