import { isSameDate, type CalDate, type WallTime } from '@/domain/time';

import { formatLongDate, formatLongRange, formatProseTimeRange, onWeekday } from '../dates/format';
import { SALUTATION } from '../names/person';
import { renderPeople, type Person } from '../people/list';
import { searchWords } from '../sort/fold';

/**
 * Grammatical gender and number of an event title, fixed per report type in
 * `POINT_TYPES` (ADR 0064): proběhl … který / proběhla … kterou /
 * proběhlo … které / proběhly … které / proběhla … která (neuter plural,
 * „Školní kola olympiády“).
 */
/** Every title gender, once: the report types and the contracts follow this list. */
export const TITLE_GENDERS = ['m', 'f', 'n', 'pl', 'npl'] as const;
export type TitleGender = (typeof TITLE_GENDERS)[number];

export type Campus = 'smichov' | 'radlice' | 'na-vidouli' | 'jinde';

const PAST_TENSE: Readonly<Record<TitleGender, string>> = {
  m: 'proběhl',
  f: 'proběhla',
  n: 'proběhlo',
  pl: 'proběhly',
  npl: 'proběhla',
};

/** The relative pronoun as the object of „organizovali“ (accusative, inanimate). */
const WHICH: Readonly<Record<TitleGender, string>> = {
  m: 'který',
  f: 'kterou',
  n: 'které',
  pl: 'které',
  npl: 'která',
};

const CAMPUS: Readonly<Record<Exclude<Campus, 'jinde'>, string>> = {
  smichov: 'v areálu Smíchov',
  radlice: 'v areálu Radlice',
  'na-vidouli': 'v areálu Na Vidouli',
};

/** organizoval / organizovala / organizovali / organizovaly */
export function organiserVerb(organisers: readonly Person[]): string {
  const women = organisers.filter((p) => SALUTATION[p.salutation].sex === 'f').length;
  if (organisers.length === 1) return women === 1 ? 'organizovala' : 'organizoval';
  return women === organisers.length ? 'organizovaly' : 'organizovali';
}

/** „S206“ → „v učebně S206“; anything else is used as typed. */
export function roomLocative(room: string): string {
  const code = room.trim();
  return /^[A-Z]{0,2}\d{1,4}[A-Z]?$/.test(code) ? `v učebně ${code}` : code;
}

export interface OpeningInput {
  readonly date: CalDate;
  /** Last day of a multi-day event. */
  readonly endDate?: CalDate;
  readonly from?: WallTime;
  readonly to?: WallTime;
  readonly campus: Campus;
  /** A locative phrase: „v učebně S206“, „v Laboratoři fyziky v učebně S8“, „na Pražském hradě“. */
  readonly place?: string;
  readonly title: string;
  /** Unknown (type „Jiné“): the sentence says „proběhla akce „…““, always correct. */
  readonly titleGender?: TitleGender;
  /** The point type („Seminář“), said before the title with `titleGender` as its own gender. */
  readonly typeName?: string;
  readonly organisers: readonly Person[];
}

/** „seminář Robotická olympiáda“; the title alone when it already holds the type („Vesmírný seminář“). */
function namedTitle(title: string, typeName: string | undefined): string {
  const noun = typeName?.trim() ?? '';
  if (noun === '' || holdsWords(searchWords(title), searchWords(noun))) return title;
  // „Seminář“ becomes „seminář“; an acronym („SOČ“) keeps its capitals.
  const word = /^\p{Lu}\p{Ll}/u.test(noun)
    ? noun.charAt(0).toLocaleLowerCase('cs') + noun.slice(1)
    : noun;
  return `${word} ${title}`;
}

/** Whether the words run in order, whole, somewhere in the text: „Seminární práce“ does not hold „seminář“. */
function holdsWords(text: readonly string[], words: readonly string[]): boolean {
  return words.length > 0 && text.some((_, i) => words.every((w, k) => text[i + k] === w));
}

/**
 * The pre-written first sentence of a report point, in the template's style:
 * „Ve středu 14. října 2026 od 10.00 do 12.00 hodin v areálu Smíchov
 * v učebně S206 proběhl seminář Robotická olympiáda, který organizovali slečna
 * Eva Malá a pan Jan Novák (oba 3.B).“ The submitter edits it freely afterwards.
 */
export function openingSentence(input: OpeningInput): string {
  // formatLongRange throws on a range that ends before it starts.
  const when =
    input.endDate && !isSameDate(input.date, input.endDate)
      ? `Ve dnech ${formatLongRange(input.date, input.endDate)}`
      : `${onWeekday(input.date, { capitalize: true })} ${formatLongDate(input.date)}`;
  const time = input.from ? formatProseTimeRange(input.from, input.to) : '';
  const where = [input.campus === 'jinde' ? '' : CAMPUS[input.campus], input.place?.trim() ?? '']
    .filter(Boolean)
    .join(' ');

  const gender: TitleGender = input.titleGender ?? 'f';
  const title = input.title.trim();
  const what = input.titleGender ? namedTitle(title, input.typeName) : `akce „${title}“`;
  const main = [when, time, where, PAST_TENSE[gender], what].filter(Boolean).join(' ');

  if (input.organisers.length === 0) return `${main}.`;
  const people = renderPeople(input.organisers, { join: 'and', order: 'input' });
  return `${main}, ${WHICH[gender]} ${organiserVerb(input.organisers)} ${people}.`;
}
