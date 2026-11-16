import { CONSONANTS } from './adjectives';

/** „v“ or „ve“ before a place (ADR 0069), and the casing rule it shares with declining. */

const SIBILANT_CLUSTER = new RegExp(`^[szšž][${CONSONANTS}]`, 'u');
const VE_CLUSTERS: readonly string[] = ['dv', 'tř', 'čt', 'hř', 'lh', 'tm', 'dn', 'mn'];
const VE_NUMBERS: readonly number[] = [2, 3, 4, 12, 13, 14];
const VE_NUMBER_RANGES: readonly (readonly [number, number])[] = [
  [20, 49],
  [200, 499],
  [2000, 4999],
];
const MIN_UPPERCASE_LETTERS = 2;
const VOWEL = /[aeiouyáéěíóúůý]/iu;
/** Capitals said as a word, not letter by letter: „ve STEM učebně“. */
const ACRONYM_WORDS: ReadonlySet<string> = new Set(['stem', 'steam']);

/** A word typed in capitals, which stays in capitals when declined: „ZŠ“, „DDM“. */
export const isUppercaseWord = (core: string): boolean =>
  (core.match(/\p{L}/gu)?.length ?? 0) >= MIN_UPPERCASE_LETTERS &&
  core === core.toLocaleUpperCase('cs');

function numberTakesVe(value: number): boolean {
  return (
    VE_NUMBERS.includes(value) ||
    VE_NUMBER_RANGES.some(([from, to]) => value >= from && value <= to)
  );
}

/**
 * Whether „v“ becomes „ve“ before this word, the first printed after it, in its final form.
 * Capitals are spelled letter by letter („v DDM“, „v SPŠE“, „ve VR učebně“) unless they
 * are a listed word with a vowel („ve ŠKOLE“) or an acronym said as a word („ve STEM“).
 */
export function takesVe(core: string, isListedWord: (key: string) => boolean): boolean {
  const digits = /^\d+/u.exec(core)?.[0];
  if (digits !== undefined) return numberTakesVe(Number(digits));
  const key = core.toLocaleLowerCase('cs');
  const word = ACRONYM_WORDS.has(key) || (VOWEL.test(key) && isListedWord(key));
  if (isUppercaseWord(core) && !word) return /^[VFW]/u.test(core);
  return (
    /^[vfw]/u.test(key) ||
    SIBILANT_CLUSTER.test(key) ||
    VE_CLUSTERS.some((cluster) => key.startsWith(cluster))
  );
}
