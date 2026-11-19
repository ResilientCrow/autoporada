import { FUNCTION_HEADS } from '@/domain/actor';

import { SALUTATION, type Salutation, type Sex } from './person';

/**
 * What can stand before a name (ADR 0072 item 5): the ředitel, the four heads of a function, and
 * the tiers that print a noun of their own. The last, `absolvent`, prints before the salutation.
 */
export const PERSON_HEADS = ['reditel', ...FUNCTION_HEADS, 'profesor', 'absolvent'] as const;
export type PersonHead = (typeof PERSON_HEADS)[number];

/** The cases a person is named in: „pan Jan Novák“, „pana Jana Nováka“. */
export type NameCase = 'nominative' | 'genitive';

/** A person's salutation and what is written between it and the name. */
export interface HeadedPerson {
  readonly salutation: Salutation;
  readonly head?: PersonHead;
  /** After the head noun, never declined: „pro pedagogickou činnost“, „PR oddělení“. */
  readonly complement?: string;
}

type Nouns = Readonly<Record<Sex, Readonly<Record<NameCase, string>>>>;

const noun = (m1: string, f1: string, m2: string, f2: string): Nouns => ({
  m: { nominative: m1, genitive: m2 },
  f: { nominative: f1, genitive: f2 },
});

/** Each head's noun by the person's sex, in the 1st and 2nd case. */
const NOUNS: Readonly<Record<PersonHead, Nouns>> = {
  reditel: noun('ředitel', 'ředitelka', 'ředitele', 'ředitelky'),
  'statutarni-zastupce': noun(
    'statutární zástupce',
    'statutární zástupkyně',
    'statutárního zástupce',
    'statutární zástupkyně',
  ),
  zastupce: noun('zástupce', 'zástupkyně', 'zástupce', 'zástupkyně'),
  vedouci: noun('vedoucí', 'vedoucí', 'vedoucího', 'vedoucí'),
  clen: noun('člen', 'členka', 'člena', 'členky'),
  profesor: noun('profesor', 'profesorka', 'profesora', 'profesorky'),
  absolvent: noun('absolvent', 'absolventka', 'absolventa', 'absolventky'),
};

/**
 * The person's name with their salutation and head, in the given case. `name` is the name as the
 * caller has it in that case (titles included). The salutation picks the noun's sex, so a slečna
 * takes the woman's noun. The word order is salutation, noun, complement, name: „paní zástupkyně
 * pro pedagogickou činnost Mgr. Jana Nováková“; an absolvent goes before the salutation, as a role
 * does: „absolvent pan Jan Novák“. Without a head, just the salutation and the name.
 */
export function headedName(
  person: HeadedPerson,
  name: string,
  nameCase: NameCase = 'nominative',
): string {
  const { sex, label, genitive } = SALUTATION[person.salutation];
  const salutation = nameCase === 'genitive' ? genitive : label;
  if (person.head === undefined) return `${salutation} ${name}`;
  const word = NOUNS[person.head][sex][nameCase];
  if (person.head === 'absolvent') return `${word} ${salutation} ${name}`;
  const complement = person.complement?.trim();
  return [salutation, word, complement, name].filter(Boolean).join(' ');
}
