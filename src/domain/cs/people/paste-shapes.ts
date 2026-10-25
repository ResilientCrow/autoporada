import { PARTICLES } from '../names/exceptions';
import { isTitleAfter, isTitleBefore } from '../names/titles';
import { normalizeClass, parseClass } from '../sort/class-code';
import { foldForSearch } from '../sort/fold';

/** `-`, `–`, `—`, `•`, `*`, `·` and the like; the space after them is optional: „-Jan Novák“. */
const SYMBOL_BULLET = /^[-–—•‣▪●◦·*]+\s*/u;
/** „1. “ and „2) “; the space is required, or „3.B“ would lose its „3.“. */
const NUMBER_BULLET = /^\d{1,3}[.)]\s+/;
/** „3. B Jan Novák“ is a class with a space, not item 3. A two-letter token stays a bullet. */
const SPACED_CLASS = /^\d\.\s+[A-Za-z]\s/;

export const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export function stripBullet(line: string): string {
  const symbol = line.replace(SYMBOL_BULLET, '');
  if (symbol !== line) return symbol.trim();
  return NUMBER_BULLET.test(line) && !SPACED_CLASS.test(line)
    ? line.replace(NUMBER_BULLET, '').trim()
    : line;
}

/** A spaced dash separates like a comma: „Jan Novák – 3.B“. Hyphens inside names have no spaces. */
export const commaForDash = (text: string): string => text.replace(/\s[-–—]\s/gu, ', ');

/** The text of a closing parenthesis, and what is left: „Jan Novák (3.B)“. */
export function takeParenthesis(text: string): { rest: string; inner?: string } {
  const match = /\s*\(([^()]*)\)\s*$/.exec(text);
  if (!match) return { rest: text };
  return { rest: text.slice(0, match.index), inner: match[1] ?? '' };
}

/** A class code is normalised („3b“ → „3.B“); anything else (a job, a company) is only tidied. */
export function affiliationOf(text: string): string | undefined {
  const tidy = words(text).join(' ');
  if (!tidy) return undefined;
  return parseClass(tidy) ? normalizeClass(tidy) : tidy;
}

const isDigitDot = (word: string | undefined) => /^\d\.?$/.test(word ?? '');
const isLetter = (word: string | undefined) => /^[A-Za-z]$/.test(word ?? '');

/**
 * A class at the start or the end of the words: „3.B“, „L1B“, and „3. B“
 * written with a space. The start wins, so one code is taken.
 */
export function takeClass(tokens: readonly string[]): { rest: string[]; code?: string } {
  const spaced = (at: number) =>
    isDigitDot(tokens[at]) && isLetter(tokens[at + 1]) ? `${tokens[at]} ${tokens[at + 1]}` : '';
  const first = tokens[0] ?? '';
  if (tokens.length > 1 && parseClass(spaced(0))) {
    return { rest: tokens.slice(2), code: normalizeClass(spaced(0)) };
  }
  if (tokens.length > 1 && parseClass(first)) {
    return { rest: tokens.slice(1), code: normalizeClass(first) };
  }
  const last = tokens.at(-1) ?? '';
  if (tokens.length > 2 && parseClass(spaced(tokens.length - 2))) {
    return { rest: tokens.slice(0, -2), code: normalizeClass(spaced(tokens.length - 2)) };
  }
  if (tokens.length > 1 && parseClass(last)) {
    return { rest: tokens.slice(0, -1), code: normalizeClass(last) };
  }
  return { rest: [...tokens] };
}

/**
 * A word of a name: letters, marks, and inside it hyphens, apostrophes and dots
 * („J.“, „O'Brien“). It starts with a capital, or is a particle („van“): a
 * lowercase word is a job or a note („učitel“, „ml.“), not a name. A title is
 * none either.
 */
export const isNameWord = (word: string): boolean =>
  /^\p{L}[\p{L}\p{M}.'’-]*$/u.test(word) &&
  (/^\p{Lu}/u.test(word) || PARTICLES.has(word.toLowerCase())) &&
  !isTitleBefore(word) &&
  !isTitleAfter(word);

/**
 * The titles at the start of `tokens`, joined by „et“ as in „Mgr. et Mgr.“,
 * and the words after them. Used for a comma part: „Novák, Ing. Jan“.
 */
export function takeTitlesBefore(tokens: readonly string[]): { titles: string[]; rest: string[] } {
  let at = 0;
  while (at < tokens.length) {
    const word = tokens[at] ?? '';
    const joined = word === 'et' && at > 0 && isTitleBefore(tokens[at + 1] ?? '');
    if (!isTitleBefore(word) && !joined) break;
    at++;
  }
  return { titles: tokens.slice(0, at), rest: tokens.slice(at) };
}

/**
 * Common Czech given names, men's and women's, without diacritics and case.
 * There is no name list in the directory or the declension rules; this one
 * only tells a given name from a surname when a pasted line has no comma.
 * A name is not meant to be missing from it: a missing one only costs a check.
 */
const GIVEN = new Set(
  foldForSearch(`
    Jan Petr Pavel Jiří Josef Martin Tomáš Jaroslav Miroslav Zdeněk František Václav Michal Karel
    Milan Vladimír Lukáš David Jakub Ladislav Roman Ondřej Marek Ivan Antonín Radek Daniel Filip
    Aleš Libor Vojtěch Stanislav Luboš Jindřich Richard Adam Matěj Dominik Patrik Štěpán Oldřich
    Vít Bohumil Rudolf Zbyněk Robert Alois Lubomír Michael Matyáš Marcel Rostislav Kryštof Šimon
    Ludvík Radim Přemysl Bedřich Evžen Hynek Dušan Vilém Viktor Emil Oto Eduard Gabriel Samuel
    Kamil Ctibor Denis Erik Igor Leoš Otakar Slavomír Vratislav Boris Jonáš Mikuláš Norbert Albert
    Arnošt Alexandr Alexander Andrej Bohdan Bohuslav Dalibor Drahomír Ivo Jindra Svatopluk Šárka
    Marie Jana Eva Anna Hana Lenka Kateřina Lucie Věra Alena Petra Jaroslava Veronika Martina
    Jitka Tereza Michaela Ivana Zuzana Monika Helena Ludmila Markéta Barbora Pavla Dana Simona
    Andrea Klára Nikola Nela Adéla Eliška Karolína Natálie Kristýna Aneta Denisa Vendula Alžběta
    Blanka Božena Dagmar Drahomíra Gabriela Irena Iveta Jarmila Jiřina Květa Libuše Miloslava
    Olga Renata Romana Radka Sabina Soňa Stanislava Vladimíra Zdeňka Žaneta Daniela Ilona Ingrid
    Naděžda Magdaléna Miroslava Milena Vlasta Zora Lada Julie Sofie Viktorie Emma Laura Linda
    Kamila Kristina Nina Tamara Ema Amálie Beáta Diana Edita Hedvika Marcela Marta Olivie Pavlína
    Taťána Valérie Vanda Jolana
  `)
    .split(/\s+/)
    .filter(Boolean),
);

type Role = 'given' | 'family' | 'unknown';

/**
 * A given name from the list or an initial; a family name by an adjectival
 * ending (Nová, Nováková, Novotný), which no given name has. Anything else
 * says nothing: Novák and Vlk look like Marek and Daniel.
 */
function roleOf(word: string): Role {
  const parts = word.split('-');
  if (/^\p{Lu}\.$/u.test(word) || parts.every((part) => GIVEN.has(foldForSearch(part)))) {
    return 'given';
  }
  return /[áý]$/u.test((parts.at(-1) ?? '').toLocaleLowerCase('cs')) ? 'family' : 'unknown';
}

/**
 * The part after a comma that follows a lone surname reads as the given name
 * („Novák, Jan“): known given names and initials, or one capitalised word that
 * is not all capitals. An organisation („ČVUT“, „Gymnázium Praha“) is not.
 */
export function looksGiven(part: string): boolean {
  const tokens = words(part);
  if (tokens.every((word) => isNameWord(word) && roleOf(word) === 'given'))
    return tokens.length > 0;
  const [only = ''] = tokens;
  return tokens.length === 1 && isNameWord(only) && !/^[\p{Lu}'’-]{2,}$/u.test(only);
}

export interface NameReading {
  readonly givenName: string;
  readonly familyName: string;
}

const reading = (all: readonly string[], familyStart: number): NameReading => ({
  givenName: all.slice(0, familyStart).join(' '),
  familyName: all.slice(familyStart).join(' '),
});

/**
 * Given name first. The family name starts at a particle („van Beethoven“),
 * else it is the last word plus the family names just before it
 * („Nováková Dvořáková“), always leaving one given name.
 */
function givenFirst(all: readonly string[]): { name: NameReading; particle: boolean } {
  const particle = all.findIndex((w, i) => i > 0 && PARTICLES.has(w.toLowerCase()));
  if (particle > 0) return { name: reading(all, particle), particle: true };
  let start = all.length - 1;
  while (start > 1 && roleOf(all[start - 1] ?? '') === 'family') start--;
  return { name: reading(all, start), particle: false };
}

/** Family name first: the first word plus the family names right after it, leaving a given name. */
function familyFirst(all: readonly string[]): NameReading {
  let end = 1;
  while (end < all.length - 1 && roleOf(all[end] ?? '') === 'family') end++;
  return { familyName: all.slice(0, end).join(' '), givenName: all.slice(end).join(' ') };
}

interface OrderChoice {
  readonly primary: NameReading;
  readonly alternate: NameReading;
  /** False when nothing favoured one order; `primary` is then the given-first reading. */
  readonly certain: boolean;
}

/**
 * Chooses between „Jan Novák“ and „Novák Jan“ by what is known of the first
 * and the last word. A comma after a lone surname („Novák, Jan“) counts for
 * the family-first order, but gives way to a given name in the first place.
 * With three or more words the reading is also a guess unless the given names
 * are all known (or a particle starts the surname). Two or more words are
 * required.
 */
export function chooseOrder(all: readonly string[], inverted: boolean): OrderChoice {
  const first = roleOf(all[0] ?? '');
  const last = roleOf(all.at(-1) ?? '');
  const given = givenFirst(all);
  const family = familyFirst(all);
  const forGiven = Number(first === 'given') + Number(last === 'family') + Number(given.particle);
  const forFamily = Number(first === 'family') + Number(last === 'given') + Number(inverted);
  // With three or more words the given names may end before or after a middle
  // word: it is known only by a particle or when every given name is a known one.
  const boundary = (name: NameReading, particle: boolean) =>
    all.length < 3 || particle || words(name.givenName).every((word) => roleOf(word) === 'given');
  return forFamily > forGiven
    ? { primary: family, alternate: given.name, certain: boundary(family, false) }
    : {
        primary: given.name,
        alternate: family,
        certain: forGiven > forFamily && boundary(given.name, given.particle),
      };
}
