import { describe, expect, it } from 'vitest';

import { foldForSearch, matchesWordPrefixes, searchWords } from '../index';

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

describe('searchWords', () => {
  it.each([
    ['Jana Nováková', ['jana', 'novakova']],
    ['Novák-Dvořák (3.B)', ['novak', 'dvorak', '3', 'b']],
    ['  ŘEHOŘ   Černý ', ['rehor', 'cerny']],
    ['', []],
    ['  -() ', []],
  ])('splits %s into folded words %j', (input, expected) => {
    expect(searchWords(input)).toEqual(expected);
  });
});

describe('matchesWordPrefixes', () => {
  const name = searchWords('Jana Nováková');

  it('needs every wanted word to start some word of the name', () => {
    expect(matchesWordPrefixes(searchWords('nov'), name)).toBe(true);
    expect(matchesWordPrefixes(searchWords('nov jan'), name)).toBe(true);
    expect(matchesWordPrefixes(searchWords('nov petr'), name)).toBe(false);
  });

  it('does not match the middle of a word, and an empty list of wanted words matches any name', () => {
    expect(matchesWordPrefixes(searchWords('ova'), name)).toBe(false);
    expect(matchesWordPrefixes([], name)).toBe(true);
    expect(matchesWordPrefixes(['jana'], [])).toBe(false);
  });
});
