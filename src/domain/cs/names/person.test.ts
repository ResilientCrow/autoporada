import { describe, expect, it } from 'vitest';

import { SALUTATION, SALUTATIONS, salutationsFor } from './person';

describe('SALUTATIONS', () => {
  it('lists every salutation once, in the order the editor offers them', () => {
    expect(SALUTATIONS).toEqual(['pan', 'pani', 'slecna']);
    expect([...SALUTATIONS].sort()).toEqual(Object.keys(SALUTATION).sort());
  });
});

describe('salutationsFor', () => {
  it('offers a student pan or slečna, anyone else pan or paní (ADR 0072 item 6)', () => {
    expect(salutationsFor(true)).toEqual(['pan', 'slecna']);
    expect(salutationsFor(false)).toEqual(['pan', 'pani']);
  });
});
