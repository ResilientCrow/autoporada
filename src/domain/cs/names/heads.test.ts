import { describe, expect, it } from 'vitest';

import { headedName, PERSON_HEADS, type NameCase, type PersonHead } from './heads';
import type { Salutation } from './person';

/** [head, man 1st, woman 1st, man 2nd, woman 2nd] — ADR 0072 item 5. */
const NOUNS: readonly (readonly [PersonHead, string, string, string, string])[] = [
  ['reditel', 'ředitel', 'ředitelka', 'ředitele', 'ředitelky'],
  [
    'statutarni-zastupce',
    'statutární zástupce',
    'statutární zástupkyně',
    'statutárního zástupce',
    'statutární zástupkyně',
  ],
  ['zastupce', 'zástupce', 'zástupkyně', 'zástupce', 'zástupkyně'],
  ['vedouci', 'vedoucí', 'vedoucí', 'vedoucího', 'vedoucí'],
  ['clen', 'člen', 'členka', 'člena', 'členky'],
  ['profesor', 'profesor', 'profesorka', 'profesora', 'profesorky'],
];

const SALUTE: Record<NameCase, Record<Salutation, string>> = {
  nominative: { pan: 'pan', pani: 'paní', slecna: 'slečna' },
  genitive: { pan: 'pana', pani: 'paní', slecna: 'slečny' },
};

describe('the head nouns', () => {
  it('lists every head once, the ředitel first and the absolvent last', () => {
    expect(PERSON_HEADS).toEqual([
      'reditel',
      'statutarni-zastupce',
      'zastupce',
      'vedouci',
      'clen',
      'profesor',
      'absolvent',
    ]);
  });

  describe.each(NOUNS)('%s', (head, man1, woman1, man2, woman2) => {
    const noun = (salutation: Salutation, nameCase: NameCase) =>
      salutation === 'pan'
        ? nameCase === 'nominative'
          ? man1
          : man2
        : nameCase === 'nominative'
          ? woman1
          : woman2;

    it.each(['pan', 'pani', 'slecna'] as const)('%s, both cases, no complement', (salutation) => {
      for (const nameCase of ['nominative', 'genitive'] as const)
        expect(headedName({ salutation, head }, 'Jan Novák', nameCase)).toBe(
          `${SALUTE[nameCase][salutation]} ${noun(salutation, nameCase)} Jan Novák`,
        );
    });

    it('puts the complement after the noun, never declined', () => {
      expect(
        headedName({ salutation: 'pani', head, complement: 'pro majetek' }, 'Jana Nováková'),
      ).toBe(`paní ${woman1} pro majetek Jana Nováková`);
      expect(
        headedName(
          { salutation: 'pan', head, complement: 'pro majetek' },
          'Jana Nováka',
          'genitive',
        ),
      ).toBe(`pana ${man2} pro majetek Jana Nováka`);
    });
  });

  it('reads the sex from the salutation: a slečna takes the woman noun', () => {
    expect(
      headedName({ salutation: 'slecna', head: 'clen', complement: 'PR oddělení' }, 'Eva Malá'),
    ).toBe('slečna členka PR oddělení Eva Malá');
  });

  it('writes the absolvent before the salutation', () => {
    const n = (salutation: Salutation, nameCase: NameCase) =>
      headedName({ salutation, head: 'absolvent' }, 'X', nameCase);
    expect(n('pan', 'nominative')).toBe('absolvent pan X');
    expect(n('slecna', 'nominative')).toBe('absolventka slečna X');
    expect(n('pani', 'nominative')).toBe('absolventka paní X');
    expect(n('pan', 'genitive')).toBe('absolventa pana X');
    expect(n('slecna', 'genitive')).toBe('absolventky slečny X');
  });

  it('ignores a complement on an absolvent: it has none', () => {
    expect(headedName({ salutation: 'pan', head: 'absolvent', complement: 'x' }, 'X')).toBe(
      'absolvent pan X',
    );
  });

  it('prints the salutation and name alone without a head', () => {
    expect(headedName({ salutation: 'pani' }, 'Jana Malá')).toBe('paní Jana Malá');
    expect(headedName({ salutation: 'pan' }, 'Jana Nováka', 'genitive')).toBe('pana Jana Nováka');
    expect(headedName({ salutation: 'pani', complement: 'PR oddělení' }, 'Jana Malá')).toBe(
      'paní Jana Malá',
    );
  });

  it('trims the complement and ignores a blank one', () => {
    expect(
      headedName({ salutation: 'pan', head: 'clen', complement: '  PR oddělení ' }, 'Jan Novák'),
    ).toBe('pan člen PR oddělení Jan Novák');
    expect(headedName({ salutation: 'pan', head: 'clen', complement: '   ' }, 'Jan Novák')).toBe(
      'pan člen Jan Novák',
    );
  });
});
