import { describe, expect, it } from 'vitest';

import { RULE_CODES } from '@/contracts';
import { typographizeText } from '@/domain/cs';

import { cs } from './cs';

/** Flattens the nested catalogue into [path, text] pairs. */
function entries(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      entries(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const NBSP = '\u00A0';
const NBSP_AFTER = /(?:§|čl\.|odst\.|písm\.) (?=\S)/;
const NUMBER_UNIT = /\d (?=(?:hodin|hodiny|hodina|minut|minuty|let|roky|roku|dní|dny|MB|KB|%))/;
const POSTAL_CODE = /\d{3} \d{2} (?=\p{Lu})|\d{3} (?=\d{2}\p{Zs}\p{Lu})/u;

/** What the typography oracle does not know: legal references, number + unit, postal codes. */
function extraProblems(text: string): string[] {
  return [
    NBSP_AFTER.test(text) && 'legal reference',
    NUMBER_UNIT.test(text) && 'number and unit',
    POSTAL_CODE.test(text) && 'postal code',
  ].filter((p): p is string => p !== false);
}

describe('extra typography rule', () => {
  it.each([
    [`podle §${NBSP}12`, []],
    [`čl.${NBSP}5 odst.${NBSP}2 písm.${NBSP}a`, []],
    [`za 24${NBSP}hodin, 5${NBSP}MB, 10${NBSP}%`, []],
    [`170${NBSP}00${NBSP}Praha 7`, []],
    ['podle § 12', ['legal reference']],
    ['čl. 5', ['legal reference']],
    ['za 24 hodin', ['number and unit']],
    ['do 5 MB', ['number and unit']],
    ['170 00 Praha 7', ['postal code']],
  ])('%s -> %j', (text, expected) => {
    expect(extraProblems(text)).toEqual(expected);
  });
});

describe('Czech copy catalogue', () => {
  const all = entries(cs);

  it('has no empty strings', () => {
    expect(all.filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it('uses Czech quotes „…“, never straight double quotes', () => {
    expect(all.filter(([, text]) => text.includes('"'))).toEqual([]);
  });

  it('uses an en dash, never a spaced hyphen', () => {
    expect(all.filter(([, text]) => text.includes(' - '))).toEqual([]);
  });
});

describe('typography', () => {
  const all = entries(cs);

  it('is what the oracle would produce', () => {
    expect(all.filter(([, text]) => typographizeText(text) !== text).map(([path]) => path)).toEqual(
      [],
    );
  });

  it('keeps the no-break spaces the oracle does not know', () => {
    expect(all.filter(([, text]) => extraProblems(text).length > 0).map(([path]) => path)).toEqual(
      [],
    );
  });
});

describe('error copy', () => {
  it('has a text for every rule code, and nothing else', () => {
    expect(Object.keys(cs.rules).sort()).toEqual([...RULE_CODES].sort());
  });
});
