import { describe, expect, it } from 'vitest';

import { foldForSearch } from '../index';

describe('foldForSearch', () => {
  it.each([
    ['Nováková', 'novakova'],
    ['ĎŤŇ ůĚŘ', 'dtn uer'],
    ['Žluťoučký kůň', 'zlutoucky kun'],
    ['Chalupa', 'chalupa'],
    ['ČEŠTINA', 'cestina'],
    ['novak@skola.cz', 'novak@skola.cz'],
    ['', ''],
  ])('folds %s to %s', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });

  it('gives the same result for composed and decomposed input', () => {
    expect(foldForSearch('á')).toBe(foldForSearch('á'));
  });
});
