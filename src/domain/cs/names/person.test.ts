import { describe, expect, it } from 'vitest';

import { SALUTATION, SALUTATIONS } from './person';

describe('SALUTATIONS', () => {
  it('lists every salutation once, in the order the editor offers them', () => {
    expect(SALUTATIONS).toEqual(['pan', 'pani', 'slecna']);
    expect([...SALUTATIONS].sort()).toEqual(Object.keys(SALUTATION).sort());
  });
});
