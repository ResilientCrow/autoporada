import { NAMES_BY_CAPITALS, PLACE_NAMES, QUARTERS } from './names';
import { PLACE_WORDS, type PlaceGender, type PlacePreposition, type PlaceTable } from './words';

/** One typed token: punctuation off both ends, and the lowercase core to look up. */
export interface Word {
  readonly lead: string;
  readonly core: string;
  readonly trail: string;
  readonly key: string;
}

/** A place noun: its preposition, its gender and the lemma/locative pair of each of its words. */
export interface Noun {
  readonly preposition: PlacePreposition;
  readonly gender: PlaceGender;
  readonly pairs: readonly (readonly [lemma: string, locative: string])[];
  /** From PLACE_NAMES: read only when nothing but a number or a comma follows (ADR 0069). */
  readonly name: boolean;
}

export const lower = (text: string): string => text.toLocaleLowerCase('cs');
export const upper = (text: string): string => text.toLocaleUpperCase('cs');

const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;
/** Only a word of letters is declined by its form: never „aula/tělocvična“. */
export const LETTERS_ONLY = /^[\p{L}-]+$/u;
const SAFE_FEMININE = /(?:ovna|árna|írna|ebna|elna|tna|čna)$/u;
export const SAFE_FEMININE_LOCATIVE = /(?:ovně|árně|írně|ebně|elně|tně|čně)$/u;
/** A noun of fewer letters is too short to end a compound, a prefix of fewer is no prefix. */
const MIN_COMPOUND_NOUN_LETTERS = 5;
const MIN_COMPOUND_PREFIX_LETTERS = 2;
/** „Rudolfinum“ is a place; „album“ is not. */
const MIN_NEUTER_UM_LETTERS = 6;

export function toWord(token: string): Word {
  const [, lead = '', core = '', trail = ''] = WORD_PARTS.exec(token) ?? [];
  return { lead, core, trail, key: lower(core) };
}

/** Letters and digits only, in capitals, with a letter: „CAD“, „O2“, „3D“. */
export const isAllCapsCode = (core: string): boolean =>
  /^[\p{Lu}\p{N}]+$/u.test(core) && /\p{Lu}/u.test(core);

export const endsWithComma = (word: Word): boolean => word.trail.endsWith(',');

// --- The lists, read once -------------------------------------------------

function nounsOf(table: PlaceTable, name: boolean): readonly Noun[] {
  const genders: readonly PlaceGender[] = ['m', 'f', 'n', 'pl', 'npl'];
  return (['v', 'na'] as const).flatMap((preposition) =>
    genders.flatMap((gender) =>
      (table[preposition][gender] ?? []).map((entry): Noun => {
        const [nominative = '', locative = ''] = entry.split('/');
        const locatives = locative.split(' ');
        const pairs = nominative.split(' ').map((lemma, i) => [lemma, locatives[i] ?? ''] as const);
        return { preposition, gender, pairs, name };
      }),
    ),
  );
}

const WORD_NOUNS = nounsOf(PLACE_WORDS, false);
const NOUNS: readonly Noun[] = [...WORD_NOUNS, ...nounsOf(PLACE_NAMES, true)];
const joinPairs = (noun: Noun, side: 0 | 1): string =>
  noun.pairs.map((pair) => pair[side]).join(' ');
export const BY_NOMINATIVE: ReadonlyMap<string, Noun> = new Map(
  NOUNS.map((n) => [joinPairs(n, 0), n]),
);
export const BY_LOCATIVE: ReadonlyMap<string, Noun> = new Map(
  NOUNS.map((n) => [joinPairs(n, 1), n]),
);
const LONGEST_ENTRY = Math.max(...NOUNS.map((noun) => noun.pairs.length));
/** Listed single-word nouns that may end a compound („autodílna“), longest first. */
const COMPOUND_BASES: readonly Noun[] = WORD_NOUNS.filter(
  (noun) =>
    noun.pairs.length === 1 && (noun.pairs[0]?.[0].length ?? 0) >= MIN_COMPOUND_NOUN_LETTERS,
  // Not toSorted: the Arch bundle still runs on Safari 15.
).sort((a, b) => (b.pairs[0]?.[0].length ?? 0) - (a.pairs[0]?.[0].length ?? 0));

/** The longest listed entry that starts at position `from`. */
export function listedAt(words: readonly Word[], from: number, index: ReadonlyMap<string, Noun>) {
  for (let size = Math.min(LONGEST_ENTRY, words.length - from); size >= 1; size -= 1) {
    const span = words.slice(from, from + size);
    if (span.slice(0, -1).some((word) => word.trail !== '')) continue;
    const noun = index.get(span.map((word) => word.key).join(' '));
    if (noun) return noun;
  }
  return undefined;
}

/** „Praha-Smíchov“ → „v Praze-Smíchově“: a listed name and its quarters, each declined, in the name's preposition. */
export function hyphenatedName(key: string): Noun | undefined {
  const parts = key.split('-');
  const nouns = parts.map((part) => BY_NOMINATIVE.get(part));
  const [first] = nouns;
  if (nouns.length < 2 || !first || !parts.slice(1).every((part) => QUARTERS.has(part))) {
    return undefined;
  }
  const pairs = nouns.map((noun) =>
    noun?.name && noun.pairs.length === 1 ? noun.pairs[0] : undefined,
  );
  if (pairs.some((pair) => pair === undefined)) return undefined;
  const side = (i: 0 | 1): string => pairs.map((pair) => pair?.[i]).join('-');
  return {
    preposition: first.preposition,
    gender: first.gender,
    pairs: [[side(0), side(1)]],
    name: true,
  };
}

/** A name in NAMES_BY_CAPITALS counts only when typed with its capitals („Černá Hora“). */
export function typedAsName(noun: Noun | undefined, words: readonly Word[], index: number) {
  if (!noun?.name || !NAMES_BY_CAPITALS.has(joinPairs(noun, 0))) return noun;
  const span = words.slice(index, index + noun.pairs.length);
  return span.every((word) => /^\p{Lu}/u.test(word.core)) ? noun : undefined;
}

// --- Nouns read by their form ----------------------------------------------

const single = (
  preposition: PlacePreposition,
  gender: PlaceGender,
  lemma: string,
  locative: string,
): Noun => ({ preposition, gender, pairs: [[lemma, locative]], name: false });

/** „autodílna“, „skiareál“: a listed noun after a prefix takes that noun's preposition and ending. */
export function compoundNoun(key: string): Noun | undefined {
  for (const base of COMPOUND_BASES) {
    const [lemma = '', locative = ''] = base.pairs[0] ?? [];
    const prefix = key.slice(0, key.length - lemma.length);
    if (prefix.length >= MIN_COMPOUND_PREFIX_LETTERS && key.endsWith(lemma)) {
      return single(base.preposition, base.gender, key, prefix + locative);
    }
  }
  return undefined;
}

/** The safe endings: -ovna and the like, -iště, -um (after the lists, which win). */
export function endingNoun(key: string): Noun | undefined {
  if (SAFE_FEMININE.test(key)) return single('v', 'f', key, `${key.slice(0, -1)}ě`);
  if (key.endsWith('iště')) return single('na', 'n', key, `${key.slice(0, -1)}i`);
  const neuter = key.length >= MIN_NEUTER_UM_LETTERS && key.endsWith('um');
  return neuter ? single('v', 'n', key, `${key.slice(0, -2)}u`) : undefined;
}
