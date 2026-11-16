import type { PlaceGender } from './words';

export type AdjectiveKind = 'hard' | 'soft' | 'possessive' | 'determiner';

/** Czech consonants, so „taneční“ (č + ní) is an adjective and „setkání“ (á + ní) is not. */
export const CONSONANTS = 'bcčdďfghjklmnňpqrřsštťvwxzž';

const HARD = /[ýáé]$/u;
const SOFT = new RegExp(`(?:[${CONSONANTS}]ní|[cčšžřzs]í)$`, 'u');
const POSSESSIVE = /(?:ův|ov[oay])$/u;
/** „Olův“ is the shortest possessive; „ova“ alone is no adjective. */
const MIN_POSSESSIVE_LETTERS = 4;
/** The locative endings of every kind of adjective, as typed after a preposition. */
const LOCATIVE_ENDING = /(?:ém|é|ím|í|ých|ích|ově)$/u;
const LOCATIVE_DETERMINERS: ReadonlySet<string> = new Set([
  ...['našem', 'naší', 'našich', 'všech', 'obou'],
]);

/** The genders a hard adjective agrees with, by its last letter. */
const HARD_GENDERS: Readonly<Record<string, readonly PlaceGender[]>> = {
  ý: ['m'],
  á: ['f', 'npl'],
  é: ['n', 'pl'],
};

/** The genders a possessive agrees with, by its ending. */
const POSSESSIVE_GENDERS: Readonly<Record<string, readonly PlaceGender[]>> = {
  ův: ['m'],
  ovo: ['n'],
  ova: ['f', 'npl'],
  ovy: ['pl'],
};

/** „náš“, „všechny“, „obě“: the locative by the gender it agrees with. */
const DETERMINERS: ReadonlyMap<string, Readonly<Partial<Record<PlaceGender, string>>>> = new Map([
  ['náš', { m: 'našem' }],
  ['naše', { f: 'naší', n: 'našem', pl: 'našich', npl: 'našich' }],
  ['všechny', { pl: 'všech' }],
  ['všechna', { npl: 'všech' }],
  // „pl“ holds masculine and feminine plurals, so „oba“ and „obě“ cannot be told apart by it.
  ['oba', { pl: 'obou' }],
  ['obě', { pl: 'obou', npl: 'obou' }],
]);

/** „pedagogicko-psychologická“: the parts before the last end in -o; „Praha-Staré“ is no adjective. */
const ADJECTIVE_PARTS = /^(?:\p{L}+o-)*\p{L}+$/u;
/** A hyphenated word is judged, and declined, by its last part. */
const lastPart = (word: string): string => word.slice(word.lastIndexOf('-') + 1);

const isPlural = (gender: PlaceGender): boolean => gender === 'pl' || gender === 'npl';

/** What kind of adjective a lowercase word is by its form, or `null` when it is none. */
export function adjectiveKind(word: string): AdjectiveKind | null {
  if (DETERMINERS.has(word)) return 'determiner';
  if (!ADJECTIVE_PARTS.test(word)) return null;
  const tail = lastPart(word);
  if (HARD.test(tail)) return 'hard';
  if (SOFT.test(tail) || tail === 'třetí') return 'soft';
  const possessive = tail.length >= MIN_POSSESSIVE_LETTERS && POSSESSIVE.test(tail);
  return possessive ? 'possessive' : null;
}

/** The genders an adjective agrees with, or `null` when it agrees with every one. */
function agreeingGenders(word: string, kind: AdjectiveKind): readonly PlaceGender[] | null {
  const tail = lastPart(word);
  switch (kind) {
    case 'soft':
      return null;
    case 'hard':
      return HARD_GENDERS[tail.slice(-1)] ?? [];
    case 'possessive':
      return POSSESSIVE_GENDERS[POSSESSIVE.exec(tail)?.[0] ?? ''] ?? [];
    case 'determiner':
      return Object.keys(DETERMINERS.get(word) ?? {}) as PlaceGender[];
  }
}

/** Whether a word fits a noun of this gender; a word that is no adjective fits any. */
export function agrees(word: string, gender: PlaceGender): boolean {
  const kind = adjectiveKind(word);
  const genders = kind === null ? null : agreeingGenders(word, kind);
  return genders === null || genders.includes(gender);
}

/** The locative of a lowercase adjective that agrees with a noun of this gender. */
export function declineAdjective(word: string, gender: PlaceGender): string {
  const kind = adjectiveKind(word);
  const stem = word.slice(0, -1);
  switch (kind) {
    case 'determiner':
      return DETERMINERS.get(word)?.[gender] ?? word;
    case 'hard':
      if (isPlural(gender)) return `${stem}ých`;
      return gender === 'f' ? `${stem}é` : `${stem}ém`;
    case 'soft':
      if (isPlural(gender)) return `${stem}ích`;
      return gender === 'f' ? word : `${word}m`;
    case 'possessive':
      return word.replace(POSSESSIVE, isPlural(gender) ? 'ových' : 'ově');
    case null:
      return word;
  }
}

/** Whether a lowercase word is an adjective already in the locative („velké“, „národním“). */
export function isLocativeModifier(word: string): boolean {
  return LOCATIVE_ENDING.test(lastPart(word)) || LOCATIVE_DETERMINERS.has(word);
}
