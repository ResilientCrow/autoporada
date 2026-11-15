import { isSameDate, type CalDate, type WallTime } from '@/domain/time';

import { formatLongDate, formatLongRange, formatProseTimeRange, onWeekday } from '../dates/format';
import { SALUTATION } from '../names/person';
import { renderPeople, type Person } from '../people/list';
import { titleGender } from './title-gender';
import { PAST_TENSE, type TitleGender } from './title-words';

export type Campus = 'smichov' | 'radlice' | 'na-vidouli' | 'jinde';

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
  /** Read for its gender (ADR 0067); one it does not tell becomes „akce „…““. */
  readonly title: string;
  readonly organisers: readonly Person[];
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

  const title = input.title.trim();
  const known = titleGender(title);
  const gender: TitleGender = known ?? 'f';
  const what = known ? title : `akce „${title}“`;
  const main = [when, time, where, PAST_TENSE[gender], what].filter(Boolean).join(' ');

  if (input.organisers.length === 0) return `${main}.`;
  const people = renderPeople(input.organisers, { join: 'and', order: 'input' });
  return `${main}, ${WHICH[gender]} ${organiserVerb(input.organisers)} ${people}.`;
}
