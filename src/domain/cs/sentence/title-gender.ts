import { SUBSTANTIVISED_ADJECTIVES, TITLE_WORDS, type TitleGender } from './title-words';

/** Czech consonants, so „taneční“ (č + ní) is an adjective and „setkání“ (á + ní) is not. */
const CONSONANTS = 'bcčdďfghjklmnňpqrřsštťvwxzž';

const LEADING_ORDINAL = /^[^\p{L}\p{N}]*(?:\d+|[IVXLCDM]+)\.$/u;
const OUTER_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const HARD_ADJECTIVE = /[ýáé]$/u;
const SOFT_ADJECTIVE = new RegExp(`(?:[${CONSONANTS}]ní|cí|^třetí)$`, 'u');
const VERBAL_NOUN = /(?:[áeéě]ní|nutí)$/u;
const OLYMPIAD = /iáda$/u;

/** Words that join two nouns, so one verb cannot agree with both. */
const CONJUNCTIONS: ReadonlySet<string> = new Set(['a', 'i', 'nebo', 'či', '&', '+']);
/** After a comma, a later one of these makes the head one of a list. */
const LIST_CONJUNCTIONS: ReadonlySet<string> = new Set(['a', 'i', 'nebo']);
/** A substantivised adjective before one of these still names the event („prodloužená v rámci“). */
const PREPOSITIONS: ReadonlySet<string> = new Set([
  ...['v', 've', 'na', 'do', 'z', 'ze', 's', 'se', 'o', 'k', 'ke', 'pro', 'po', 'před', 'při'],
  ...['u', 'od', 'za', 'pod', 'nad', 'mezi', 'bez', 'během'],
]);

const GENDER_OF: ReadonlyMap<string, TitleGender> = new Map(
  (Object.entries(TITLE_WORDS) as [TitleGender, readonly string[]][]).flatMap(([gender, words]) =>
    words.map((word) => [word, gender] as const),
  ),
);

const lower = (text: string): string => text.toLocaleLowerCase('cs');

/** A token for analysis: quotes, colons and commas off both ends, lowercase, diacritics kept. */
const analyse = (token: string): string => lower(token.replace(OUTER_PUNCTUATION, ''));

/** A listed noun that is not also an adjective in form. */
const isNoun = (word: string): boolean =>
  GENDER_OF.has(word) && !SUBSTANTIVISED_ADJECTIVES.has(word);

const isAdjective = (word: string): boolean =>
  HARD_ADJECTIVE.test(word) || SOFT_ADJECTIVE.test(word);

interface Reading {
  /** The analysed adjectives in front of the head, in order. */
  readonly adjectives: readonly string[];
  readonly headIndex: number;
  readonly head: string;
}

/** Step 3: the adjectives in front, up to a listed noun or a word that is no adjective. */
function skipAdjectives(tokens: readonly string[], from: number): readonly string[] {
  const adjectives: string[] = [];
  for (const token of tokens.slice(from)) {
    const word = analyse(token);
    if (isNoun(word) || !isAdjective(word)) break;
    adjectives.push(word);
  }
  return adjectives;
}

/** Step 4: the word after the adjectives, or the last adjective when it names the event itself. */
function findHead(tokens: readonly string[], from: number): Reading | null {
  const adjectives = skipAdjectives(tokens, from);
  const headIndex = from + adjectives.length;
  const next = tokens[headIndex];
  const nextWord = next === undefined ? undefined : analyse(next);
  const last = adjectives.at(-1);
  const nothingFollows = nextWord === undefined || PREPOSITIONS.has(nextWord);
  if (nothingFollows && last !== undefined && SUBSTANTIVISED_ADJECTIVES.has(last)) {
    return { adjectives: adjectives.slice(0, -1), headIndex: headIndex - 1, head: last };
  }
  return nextWord === undefined ? null : { adjectives, headIndex, head: nextWord };
}

/** Step 5: one verb cannot agree with two nouns. */
function isCoordinated(tokens: readonly string[], headIndex: number): boolean {
  const token = tokens[headIndex] ?? '';
  if (token.includes('/')) return true;
  const next = tokens[headIndex + 1];
  if (next !== undefined && CONJUNCTIONS.has(lower(next))) return true;
  // „turnaj, kvalifikace do kola“ is an apposition; „setkání, diskuse a raut“ is a list.
  if (
    token.endsWith(',') &&
    tokens.slice(headIndex + 1).some((later) => LIST_CONJUNCTIONS.has(lower(later)))
  ) {
    return true;
  }
  return joinsAnotherEvent(tokens, headIndex);
}

/** „Seminář pro učitele a workshop pro žáky“: a later conjunction before another event's noun. */
function joinsAnotherEvent(tokens: readonly string[], headIndex: number): boolean {
  for (let i = headIndex + 1; i < tokens.length; i += 1) {
    if (!CONJUNCTIONS.has(lower(tokens[i] ?? ''))) continue;
    const from = i + 1;
    const noun = tokens[from + skipAdjectives(tokens, from).length];
    if (noun !== undefined && classOf(analyse(noun)) !== null) return true;
  }
  return false;
}

/** Step 6: the list, else the endings of verbal nouns and of „Robotiáda“. */
function classOf(head: string): TitleGender | null {
  const listed = GENDER_OF.get(head);
  if (listed) return listed;
  if (VERBAL_NOUN.test(head)) return 'n';
  return OLYMPIAD.test(head) ? 'f' : null;
}

/** Step 7, for one adjective ending: the gender the title reads as, or null on a mismatch. */
function agree(ending: string, gender: TitleGender, head: string): TitleGender | null {
  switch (ending) {
    case 'ý':
      return gender === 'm' ? 'm' : null;
    case 'á':
      if (gender === 'f' || gender === 'npl') return gender;
      // „Pravidelná setkání“: -á before a neuter noun in -í is a neuter plural.
      return gender === 'n' && head.endsWith('í') ? 'npl' : null;
    case 'é':
      if (gender === 'n' || gender === 'pl') return gender;
      // „Tematické exkurze“: -é before a feminine noun in -e is a plural.
      return gender === 'f' && head.endsWith('e') ? 'pl' : null;
    default:
      return null;
  }
}

/** The hard adjectives in front must all agree with the head; soft ones fit every gender. */
function agreeWithAdjectives(
  adjectives: readonly string[],
  gender: TitleGender,
  head: string,
): TitleGender | null {
  const endings = new Set(adjectives.filter((a) => HARD_ADJECTIVE.test(a)).map((a) => a.slice(-1)));
  if (endings.size === 0) return gender;
  const [ending] = endings;
  return endings.size === 1 && ending !== undefined ? agree(ending, gender, head) : null;
}

/**
 * The grammatical gender and number of an event's name, read from its title
 * (ADR 0067), or `null` when the title does not say: then the opening
 * sentence writes „proběhla akce s názvem …“ (ADR 0068), which is always correct.
 */
export function titleGender(title: string): TitleGender | null {
  const tokens = title.split(/\s+/u).filter(Boolean);
  const start = tokens.findIndex((token) => !LEADING_ORDINAL.test(token));
  if (start < 0) return null;
  const reading = findHead(tokens, start);
  if (!reading || isCoordinated(tokens, reading.headIndex)) return null;
  const gender = classOf(reading.head);
  return gender && agreeWithAdjectives(reading.adjectives, gender, reading.head);
}
