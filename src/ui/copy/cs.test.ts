import { describe, expect, it } from 'vitest';

import { RULE_CODES } from '@/contracts';
import { typographizeText } from '@/domain/cs';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';
import { ACCESS_COOLDOWN_DAYS } from '@/domain/review';

import { cs, pageTitle } from './cs';

/** Values of these keys are identifiers and addresses, not prose. */
const NOT_PROSE = new Set(['href', 'id']);

/** Flattens the nested catalogue into [path, text] pairs. */
function entries(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node)
      .filter(([key]) => !NOT_PROSE.has(key))
      .flatMap(([key, value]) => entries(value, path ? `${path}.${key}` : key));
  }
  return [];
}

const NBSP = '\u00A0';
const NBSP_AFTER = /(?:§|čl\.|odst\.|písm\.) (?=\S)/;
const NUMBER_UNIT =
  /\d (?=(?:hodin|hodiny|hodina|minut|minuty|let|roky|roku|dní|dnů|dny|znaků|znaky|MB|KB|%))/;
/** A plain space inside a number of four or more digits. */
const THOUSANDS = /\d \d{3}\b/;
const POSTAL_CODE = /\d{3} \d{2} (?=\p{Lu})|\d{3} (?=\d{2}\p{Zs}\p{Lu})/u;

/** What the typography oracle does not know: legal references, number + unit, postal codes. */
function extraProblems(text: string): string[] {
  return [
    NBSP_AFTER.test(text) && 'legal reference',
    NUMBER_UNIT.test(text) && 'number and unit',
    THOUSANDS.test(text) && 'thousands',
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
    ['do 1 000 znaků', ['number and unit', 'thousands']],
    [`do 1${NBSP}000${NBSP}znaků`, []],
    ['za 30 dnů', ['number and unit']],
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

describe('product names', () => {
  it('never says 365: Microsoft advises against it for a work or school account', () => {
    expect(entries(cs).filter(([, text]) => text.includes('365'))).toEqual([]);
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

  it('names the cooldown in days', () => {
    expect(cs.rules['request-cooldown']).toContain(`${ACCESS_COOLDOWN_DAYS}${NBSP}dní`);
  });
});

describe('step-up copy', () => {
  it('names the minutes the sign-in counts for', () => {
    expect(cs.stepUpNotice.text).toContain(`${STEP_UP_MAX_AGE_MS / 60_000}${NBSP}minut`);
  });
});

describe('pageTitle', () => {
  it('puts the app name after an en dash', () => {
    expect(pageTitle(cs.notFound.title)).toBe(`${cs.notFound.title} – ${cs.app.name}`);
  });
});
