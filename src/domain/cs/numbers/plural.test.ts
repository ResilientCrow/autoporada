import { describe, expect, it } from 'vitest';

import { countWord } from '../index';

const NB = '\u00A0';
const forms = { one: 'osoba', few: 'osoby', many: 'osob' };

describe('countWord', () => {
  it.each([
    [0, 'osob'],
    [1, 'osoba'],
    [2, 'osoby'],
    [3, 'osoby'],
    [4, 'osoby'],
    [5, 'osob'],
    [11, 'osob'],
    [12, 'osob'],
    [21, 'osob'],
    [22, 'osob'],
    [24, 'osob'],
    [101, 'osob'],
    [1000, 'osob'],
  ])('%i takes the form %j', (n, word) => {
    expect(countWord(n, forms)).toBe(`${n}${NB}${word}`);
  });

  it('binds the number to its word with a no-break space', () => {
    expect(countWord(3, forms)).toBe(`3${NB}osoby`);
    expect(countWord(3, forms)).not.toContain(' ');
  });

  it('works for any noun, not only people', () => {
    expect(countWord(2, { one: 'bod', few: 'body', many: 'bodů' })).toBe(`2${NB}body`);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s like the date helpers',
    (n) => {
      expect(() => countWord(n, forms)).toThrow(RangeError);
    },
  );
});
