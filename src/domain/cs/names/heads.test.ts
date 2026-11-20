import { describe, expect, it } from 'vitest';

import { FUNCTION_HEADS, type Tier, type UserFunction } from '@/domain/actor';

import { beforeName, headedName, PERSON_HEADS, type NameCase, type PersonHead } from './heads';
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
    // A function describes the person and goes before the salutation; „paní ředitelka“ and „pan
    // profesor“ are how the person is addressed, so the salutation stays first (ADR 0073).
    const fronted = (FUNCTION_HEADS as readonly PersonHead[]).includes(head);
    const order = (salutation: string, noun: string, name: string) =>
      fronted ? `${noun} ${salutation} ${name}` : `${salutation} ${noun} ${name}`;
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
          order(SALUTE[nameCase][salutation], noun(salutation, nameCase), 'Jan Novák'),
        );
    });

    it('puts the complement after the noun, never declined', () => {
      expect(
        headedName({ salutation: 'pani', head, complement: 'pro majetek' }, 'Jana Nováková'),
      ).toBe(order('paní', `${woman1} pro majetek`, 'Jana Nováková'));
      expect(
        headedName(
          { salutation: 'pan', head, complement: 'pro majetek' },
          'Jana Nováka',
          'genitive',
        ),
      ).toBe(order('pana', `${man2} pro majetek`, 'Jana Nováka'));
    });
  });

  it('reads the sex from the salutation: a slečna takes the woman noun', () => {
    expect(
      headedName({ salutation: 'slecna', head: 'clen', complement: 'PR oddělení' }, 'Eva Malá'),
    ).toBe('členka PR oddělení slečna Eva Malá');
  });

  it('writes a function before the salutation, as the absolvent (ADR 0073)', () => {
    const deputy = { salutation: 'pani', head: 'zastupce', complement: 'pro majetek' } as const;
    expect(headedName(deputy, 'Mgr. Jana Nováková')).toBe(
      'zástupkyně pro majetek paní Mgr. Jana Nováková',
    );
    expect(headedName(deputy, 'Mgr. Jany Novákové', 'genitive')).toBe(
      'zástupkyně pro majetek paní Mgr. Jany Novákové',
    );
    expect(headedName({ salutation: 'pani', head: 'reditel' }, 'Mgr. Jana Nováková')).toBe(
      'paní ředitelka Mgr. Jana Nováková',
    );
    expect(headedName({ salutation: 'pan', head: 'profesor' }, 'Jana Nováka', 'genitive')).toBe(
      'pana profesora Jana Nováka',
    );
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
    ).toBe('člen PR oddělení pan Jan Novák');
    expect(headedName({ salutation: 'pan', head: 'clen', complement: '   ' }, 'Jan Novák')).toBe(
      'člen pan Jan Novák',
    );
  });
});

describe('beforeName: what a user prints before the name (ADR 0072 item 5)', () => {
  const MAJETEK: UserFunction = { head: 'zastupce', complement: 'pro majetek' };
  const IT: UserFunction = { head: 'vedouci', complement: 'IT oddělení' };
  const CLEN: UserFunction = { head: 'clen', complement: 'PR oddělení' };
  const STATUTAR: UserFunction = { head: 'statutarni-zastupce', complement: null };

  it.each<[Tier | null, PersonHead | undefined]>([
    ['reditel', 'reditel'],
    ['ucitel', 'profesor'],
    ['absolvent', 'absolvent'],
    ['vedeni', undefined],
    ['zamestnanec', undefined],
    ['student', undefined],
    [null, undefined],
  ])('with no function, the tier %s prints %s', (tier, head) => {
    const out = beforeName(tier, []);
    expect(out.head).toBe(head);
    expect(out).not.toHaveProperty('complement');
  });

  it('prints the highest function, with its complement, whatever the tier', () => {
    for (const tier of ['reditel', 'vedeni', 'ucitel', 'student', 'absolvent', null] as const) {
      expect(beforeName(tier, [CLEN, MAJETEK, IT])).toEqual({
        head: 'zastupce',
        complement: 'pro majetek',
      });
    }
  });

  it('prints a function without a complement as its head alone', () => {
    const out = beforeName('vedeni', [STATUTAR]);
    expect(out).toEqual({ head: 'statutarni-zastupce' });
    expect(out).not.toHaveProperty('complement');
  });

  it('takes the first added of two functions with the same head', () => {
    const first: UserFunction = { head: 'clen', complement: 'PR oddělení' };
    const second: UserFunction = { head: 'clen', complement: 'IT oddělení' };
    expect(beforeName('student', [first, second])).toEqual({
      head: 'clen',
      complement: 'PR oddělení',
    });
  });

  it('drops a blank complement', () => {
    expect(beforeName(null, [{ head: 'vedouci', complement: '  ' }])).toEqual({ head: 'vedouci' });
  });
});
