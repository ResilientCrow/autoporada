import { adjectiveKind, agrees, declineAdjective, isLocativeModifier } from './adjectives';
import {
  BY_LOCATIVE,
  BY_NOMINATIVE,
  compoundNoun,
  endingNoun,
  endsWithComma,
  hyphenatedName,
  isAllCapsCode,
  LETTERS_ONLY,
  listedAt,
  lower,
  type Noun,
  SAFE_FEMININE_LOCATIVE,
  toWord,
  typedAsName,
  upper,
  type Word,
} from './lexicon';
import { roomPhrase } from './rooms';
import { isUppercaseWord, takesVe } from './ve';
import type { PlaceGender, PlacePreposition } from './words';

export type PlaceKind = 'typed' | 'read' | 'named';

export interface PlacePhrase {
  readonly kind: PlaceKind;
  readonly text: string;
}

interface Head {
  readonly noun: Noun;
  readonly index: number;
}

const LEADING_ORDINAL = /^\d+\.$/u;
const ADDRESS_NUMBER = /^\d{1,5}[a-zA-Z]?(?:\/\d{1,5}[a-zA-Z]?)?,?$/u;

const PREPOSITIONS: ReadonlySet<string> = new Set([
  ...['v', 've', 'na', 'u', 'do', 'z', 'ze', 'při', 'před', 'za', 'mezi', 'pod', 'nad', 'po'],
  ...['k', 'ke', 'o', 's', 'se', 'vedle', 'kolem', 'okolo', 'poblíž', 'uvnitř', 'mimo', 'přes'],
  ...['naproti', 'nedaleko', 'blízko', 'podél', 'od', 'dle', 'podle'],
]);
const ADVERBS: ReadonlySet<string> = new Set([
  ...['online', 'on-line', 'distančně', 'virtuálně', 'hybridně', 'prezenčně'],
  ...['venku', 'doma', 'jinde', 'všude', 'zde', 'tady', 'různě'],
]);
const ONLINE_TOOLS: ReadonlySet<string> = new Set([
  ...['teams', 'ms teams', 'microsoft teams', 'zoom', 'google meet', 'meet', 'webex'],
  ...['cisco webex', 'skype', 'discord', 'jitsi', 'jitsi meet'],
]);
/** Words that join two places: „aula a tělocvična“. */
const CONJUNCTIONS: ReadonlySet<string> = new Set(['a', 'i', 'nebo', 'či']);
/** What may open the part after a comma: „aula, případně tělocvična“. */
const COMMA_LINKS: ReadonlySet<string> = new Set([
  ...CONJUNCTIONS,
  ...['případně', 'popřípadě', 'popř.', 'resp.', 'respektive', 'anebo'],
]);
/** Heads that also name a street: „Dlouhá třída“ is an avenue („na“), „kmenová třída“ a room. */
const STREET_LIKE_HEADS: ReadonlySet<string> = new Set(['třída']);

// --- Declining words, with the typed casing ---------------------------------

/** The typed word with its ending swapped as the lemma becomes the locative. */
function declineWord(typed: string, lemma: string, locative: string): string {
  const [typedParts, lemmaParts, locativeParts] = [typed, lemma, locative].map((w) => w.split('-'));
  const hyphenated = (lemmaParts?.length ?? 0) > 1 && typedParts?.length === lemmaParts?.length;
  if (hyphenated && locativeParts?.length === lemmaParts?.length) {
    // „Frýdek-Místek“ → „Frýdku-Místku“: each part by its own pair.
    return (typedParts ?? [])
      .map((part, i) => declineWord(part, lemmaParts?.[i] ?? '', locativeParts?.[i] ?? ''))
      .join('-');
  }
  let common = 0;
  while (common < lemma.length && lemma[common] === locative[common]) common += 1;
  const result = typed.slice(0, typed.length - (lemma.length - common)) + locative.slice(common);
  return isUppercaseWord(typed) ? upper(result) : result;
}

const printWord = (word: Word, core: string): string => word.lead + core + word.trail;

/** A modifier or postposed adjective in the locative; a code like „CAD“ stays as typed. */
function printModifier(word: Word, gender: PlaceGender): string {
  if (adjectiveKind(word.key) === null) return printWord(word, word.core);
  return printWord(word, declineWord(word.core, word.key, declineAdjective(word.key, gender)));
}

function printHead(words: readonly Word[], noun: Noun): readonly string[] {
  return words.map((word, i) => {
    const [lemma = '', locative = ''] = noun.pairs[i] ?? [];
    return printWord(word, declineWord(word.core, lemma, locative));
  });
}

// --- „v“ or „ve“ -----------------------------------------------------------

function withPreposition(preposition: PlacePreposition, firstToken: string | undefined): string {
  if (preposition === 'na') return 'na';
  return takesVe(toWord(firstToken ?? '').core, (key) => BY_LOCATIVE.has(key)) ? 've' : 'v';
}

// --- Step 4: a noun phrase in the nominative --------------------------------

const isModifier = (word: Word): boolean =>
  adjectiveKind(word.key) !== null || isAllCapsCode(word.core);

/** „Hluboká jeskyně“: a one-word name shaped like an adjective, with a word after it, is that word's adjective. */
function adjectiveNameBeforeNoun(noun: Noun, words: readonly Word[], index: number): boolean {
  const word = words[index];
  const next = words[index + 1];
  if (!noun.name || noun.pairs.length !== 1 || !word || !next || endsWithComma(word)) return false;
  return adjectiveKind(word.key) !== null && !PREPOSITIONS.has(next.key) && !/^\d/u.test(next.core);
}

/** What may follow a listed name: nothing, a comma, a number, „a“ or a preposition („Ústí nad Labem“). */
function nameEndsHere(noun: Noun, words: readonly Word[], end: number): boolean {
  const last = words[end - 1];
  const next = words[end];
  if (!noun.name || next === undefined || (last !== undefined && endsWithComma(last))) return true;
  return /^\d/u.test(next.core) || CONJUNCTIONS.has(next.key) || PREPOSITIONS.has(next.key);
}

/** „Dlouhá třída“ with a capital: a street, not a room. */
function streetLike(noun: Noun, modifiers: readonly Word[]): boolean {
  const head = noun.pairs.length === 1 ? noun.pairs[0]?.[0] : undefined;
  if (head === undefined || !STREET_LIKE_HEADS.has(head)) return false;
  return modifiers.some((word) => adjectiveKind(word.key) !== null && /^\p{Lu}/u.test(word.core));
}

/** „ČVUT menza“: a listed abbreviation right before a common noun is its modifier („v ČVUT menze“). */
function abbreviationBeforeNoun(noun: Noun, words: readonly Word[], index: number): boolean {
  const word = words[index];
  const next = words[index + 1];
  if (noun.pairs.length !== 1 || !word || !next || !isAllCapsCode(word.core)) return false;
  if (endsWithComma(word)) return false;
  const listed = listedAt(words, index + 1, BY_NOMINATIVE);
  if (listed) return !listed.name;
  if (!LETTERS_ONLY.test(next.core) || isAllCapsCode(next.core)) return false;
  return (compoundNoun(next.key) ?? endingNoun(next.key)) !== undefined;
}

/**
 * The head: a listed entry, or the first word no modifier that the endings read. With
 * `wordsOnly` (after a comma) a name is no head („v Divadle Viola, Praha 1“), and a
 * capitalised word, which may be a town („…, Most“, „…, Malá Skála“), only by its ending.
 */
function findHead(words: readonly Word[], from: number, wordsOnly: boolean): Head | null {
  for (let index = from; index < words.length; index += 1) {
    const word = words[index];
    if (!word) return null;
    if (wordsOnly && /^\p{Lu}/u.test(word.core) && !isModifier(word)) {
      const noun = LETTERS_ONLY.test(word.core) ? endingNoun(word.key) : undefined;
      return noun ? { noun, index } : null;
    }
    const listed =
      typedAsName(listedAt(words, index, BY_NOMINATIVE), words, index) ?? hyphenatedName(word.key);
    if (listed?.name && wordsOnly) return null;
    const head =
      listed &&
      !abbreviationBeforeNoun(listed, words, index) &&
      !adjectiveNameBeforeNoun(listed, words, index);
    if (head) return { noun: listed, index };
    if (isModifier(word)) continue;
    if (!LETTERS_ONLY.test(word.core)) return null;
    const derived = compoundNoun(word.key) ?? endingNoun(word.key);
    return derived ? { noun: derived, index } : null;
  }
  return null;
}

/** „Karlova“ always; a hard adjective only typed in lowercase („ekonomická“, not the street „Grafická“). */
function postposedAdjective(word: Word): boolean {
  const kind = adjectiveKind(word.key);
  return kind === 'possessive' || (kind === 'hard' && word.core === lower(word.core));
}

/** How many adjectives after the head are declined with it (0 when none are, or not safely). */
function postposedCount(words: readonly Word[], from: number, head: Word, gender: PlaceGender) {
  if (isUppercaseWord(head.core)) return 0;
  let end = from;
  while (end < words.length) {
    const word = words[end];
    if (!word || !postposedAdjective(word) || !agrees(word.key, gender)) break;
    end += 1;
    if (endsWithComma(word)) break;
  }
  const last = words[end - 1];
  const next = words[end];
  const closed =
    next === undefined ||
    (last !== undefined && endsWithComma(last)) ||
    PREPOSITIONS.has(next.key) ||
    isAllCapsCode(next.core);
  return end > from && closed ? end - from : 0;
}

/**
 * After a comma, a common noun in the nominative reads on in its own preposition („v aule,
 * v tělocvičně“, „v učebně S205, ve 2. patře“); a name, an address or anything else stays as
 * typed („v Divadle Viola, Národní 7, Praha 1“).
 */
function afterComma(rest: readonly string[]): readonly string[] {
  const link = COMMA_LINKS.has(lower(rest[0] ?? '')) ? 1 : 0;
  const read = rest.length > link ? readNominative(rest.slice(link), true) : null;
  return read === null ? rest : [...rest.slice(0, link), read];
}

/**
 * After a conjunction, another place in the nominative reads on in its own preposition.
 * A capitalised word there that is not read („aula a Makerspace“) leaves the whole place
 * unread (null); a lowercase one is a genitive („Laboratoř fyziky a chemie“) and a room
 * („učebny S201 a S202“) stays.
 */
function withListTail(rest: readonly string[], wordsOnly: boolean): readonly string[] | null {
  for (const [i, token] of rest.entries()) {
    if (token.endsWith(',')) return [...rest.slice(0, i + 1), ...afterComma(rest.slice(i + 1))];
    if (!CONJUNCTIONS.has(lower(token))) continue;
    const next = readNominative(rest.slice(i + 1), wordsOnly);
    if (next !== null) return [...rest.slice(0, i + 1), next];
    if (/^\p{Lu}\P{N}*$/u.test(toWord(rest[i + 1] ?? '').core)) return null;
  }
  return rest;
}

/** Step 4: `[ordinal] [modifiers] head [postposed adjectives] [rest]` in the nominative. */
function readNominative(tokens: readonly string[], wordsOnly = false): string | null {
  const words = tokens.map(toWord);
  const start = LEADING_ORDINAL.test(tokens[0] ?? '') ? 1 : 0;
  const found = findHead(words, start, wordsOnly);
  if (!found) return null;
  const { noun, index } = found;
  const modifiers = words.slice(start, index);
  if (!modifiers.every((word) => agrees(word.key, noun.gender))) return null;
  if (streetLike(noun, modifiers)) return null;
  const headEnd = index + noun.pairs.length;
  const headWords = words.slice(index, headEnd);
  const lastHead = headWords.at(-1) ?? toWord('');
  const end = headEnd + postposedCount(words, headEnd, lastHead, noun.gender);
  if (!nameEndsHere(noun, words, end)) return null;
  const printed = [
    ...tokens.slice(0, start),
    ...modifiers.map((word) => printModifier(word, noun.gender)),
    ...printHead(headWords, noun),
    ...words.slice(headEnd, end).map((word) => printModifier(word, noun.gender)),
  ];
  const comma = words.slice(0, end).findIndex(endsWithComma);
  const rest = tokens.slice(end);
  const tail =
    comma === -1 ? withListTail(rest, wordsOnly) : comma === end - 1 ? afterComma(rest) : rest;
  if (tail === null) return null;
  const all = [...printed, ...tail];
  return `${withPreposition(noun.preposition, all[0])} ${all.join(' ')}`;
}

// --- Step 5: already in the locative ---------------------------------------

function locativePreposition(words: readonly Word[], at: number): PlacePreposition | undefined {
  const listed = listedAt(words, at, BY_LOCATIVE);
  if (listed) return listed.preposition;
  const word = words[at];
  if (!word || !LETTERS_ONLY.test(word.core)) return undefined;
  const key = word.key;
  if (SAFE_FEMININE_LOCATIVE.test(key)) return 'v';
  return key.endsWith('išti') ? 'na' : undefined;
}

/** Step 5: the same walk against the locatives; only the preposition is missing. */
function readLocative(tokens: readonly string[]): string | null {
  const words = tokens.map(toWord);
  for (let at = LEADING_ORDINAL.test(tokens[0] ?? '') ? 1 : 0; at < words.length; at += 1) {
    const preposition = locativePreposition(words, at);
    if (preposition) return `${withPreposition(preposition, tokens[0])} ${tokens.join(' ')}`;
    const word = words[at];
    if (!word || !(isLocativeModifier(word.key) || isAllCapsCode(word.core))) return null;
  }
  return null;
}

// --- Step 6: a name, kept as typed -----------------------------------------

/** „Národní 7“, „Plzeňská 10“, „Vltavská 1234/5“, „Hybernská 4, Praha 1“. */
function isAddress(tokens: readonly string[], words: readonly Word[]): boolean {
  return tokens.some((token, i) => {
    if (i < 1 || !ADDRESS_NUMBER.test(token)) return false;
    const kind = adjectiveKind(words[i - 1]?.key ?? '');
    const adjective = kind === 'hard' || kind === 'soft' || kind === 'possessive';
    return token.includes('/') || token.endsWith(',') || adjective;
  });
}

function nameLead(tokens: readonly string[]): string {
  const words = tokens.map(toWord);
  if (words.every((word) => isAllCapsCode(word.core))) return 'v prostorách';
  return isAddress(tokens, words) ? 'na adrese' : 'v prostorách s názvem';
}

/**
 * The phrase a Czech sentence needs for a place a teacher typed („místnost S205“ →
 * „v místnosti S205“), ADR 0069. Already a phrase („v aule“, „online“) → printed
 * as typed; a room, an app or a noun phrase from the lists and rules → read and
 * put in the locative; anything else → a lead-in by its form, the place as typed.
 */
export function placePhrase(typed: string): PlacePhrase {
  const tokens = typed.split(/\s+/u).filter(Boolean);
  const text = tokens.join(' ');
  const first = toWord(tokens[0] ?? '').key;
  // „-“ or „?“ names no place: the sentence goes without one.
  if (!/[\p{L}\p{N}]/u.test(text)) return { kind: 'typed', text: '' };
  const room = roomPhrase(text);
  if (room !== null) return { kind: 'read', text: room };
  if (PREPOSITIONS.has(first) || ADVERBS.has(first)) return { kind: 'typed', text };
  if (ONLINE_TOOLS.has(lower(text))) return { kind: 'read', text: `v aplikaci ${text}` };
  const read = readNominative(tokens) ?? readLocative(tokens);
  if (read !== null) return { kind: 'read', text: read };
  return { kind: 'named', text: `${nameLead(tokens)} ${text}` };
}
