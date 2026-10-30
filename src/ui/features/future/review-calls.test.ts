import { describe, expect, it } from 'vitest';

import { barChoices, cancelInput, decideInput } from './review-calls';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

describe('decideInput', () => {
  it('sends an approval with the page’s version and no note', () => {
    expect(decideInput(ID, 4, form({ decision: 'approve', note: 'ignored' }))).toEqual({
      id: ID,
      expectedVersion: 4,
      event: 'approve',
    });
  });

  it.each(['return', 'reject'] as const)('sends a %s with the note as typed', (event) => {
    expect(decideInput(ID, 4, form({ decision: event, note: '  Doplňte datum.  ' }))).toEqual({
      id: ID,
      expectedVersion: 4,
      event,
      note: '  Doplňte datum.  ',
    });
  });

  it('sends an empty note when the field was left empty, for the server to refuse', () => {
    expect(decideInput(ID, 4, form({ decision: 'return' }))).toEqual({
      id: ID,
      expectedVersion: 4,
      event: 'return',
      note: '',
    });
  });

  it('refuses a press that is none of the decisions (a bug, not a user error)', () => {
    expect(() => decideInput(ID, 4, form({ decision: 'cancel' }))).toThrow();
    expect(() => decideInput(ID, 4, form({}))).toThrow();
  });
});

describe('cancelInput', () => {
  it('sends the box as ticked', () => {
    expect(cancelInput(ID, 6, form({ confirmed: 'on' }))).toEqual({
      id: ID,
      expectedVersion: 6,
      confirmed: true,
    });
  });

  it('sends false for a box left empty, which the server refuses without writing', () => {
    expect(cancelInput(ID, 6, form({}))).toEqual({ id: ID, expectedVersion: 6, confirmed: false });
  });
});

describe('barChoices', () => {
  const bar = (over = {}) => ({
    decisions: ['approve', 'return', 'reject'] as const,
    othersApprove: false,
    canCancel: false,
    ...over,
  });

  it('shows what the model allows, and says so when there is something', () => {
    expect(barChoices(bar())).toEqual({
      approve: true,
      return: true,
      reject: true,
      ownItem: false,
      any: true,
    });
    expect(barChoices(bar({ decisions: ['return', 'reject'], othersApprove: true }))).toEqual({
      approve: false,
      return: true,
      reject: true,
      ownItem: true,
      any: true,
    });
  });

  it('has nothing to show for an empty bar, and the cancel alone is not a decision', () => {
    expect(barChoices(bar({ decisions: [], canCancel: true })).any).toBe(false);
    expect(barChoices(bar({ decisions: [] })).any).toBe(false);
  });
});
