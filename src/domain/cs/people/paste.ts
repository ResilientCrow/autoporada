import { splitFullName } from '../names/genitive';
import { PERSON_FIELD_MAX, type PersonName } from '../names/person';
import { isTitleAfter } from '../names/titles';
import { parseClass } from '../sort/class-code';
import { foldForSearch } from '../sort/fold';
import {
  affiliationOf,
  chooseOrder,
  commaForDash,
  isNameWord,
  looksGiven,
  stripBullet,
  takeClass,
  takeParenthesis,
  takeTitlesBefore,
  words,
  type NameReading,
} from './paste-shapes';

/** The textarea's bounds (design §5). The parser enforces them too, so no caller can skip them. */
export const PASTE_MAX_CHARS = 4000;
export const PASTE_MAX_LINES = 60;

/** A person from one line. The salutation is never guessed, so a row has none. */
export interface PasteRow extends Omit<PersonName, 'salutation'> {
  /** 1-based line of the pasted text (or entry, when split on `;`). */
  readonly line: number;
  /** The line as typed, trimmed: the preview shows it beside the reading. */
  readonly source: string;
  /** A class („3.B“) or an organisation, as the author wrote it. */
  readonly affiliation?: string;
  /** The order of the given name and surname is a guess; the preview starts the row unchecked. */
  readonly uncertainOrder: boolean;
}

type Rejection = 'no-surname' | 'too-long';

export interface PasteRejected {
  readonly line: number;
  readonly code: Rejection;
  readonly source: string;
}

export interface PasteResult {
  readonly rows: readonly PasteRow[];
  readonly rejected: readonly PasteRejected[];
  /** Text beyond 4000 characters or 60 lines was ignored. */
  readonly truncated: boolean;
}

/** A person the author used before. */
export interface KnownName {
  readonly givenName: string;
  readonly familyName: string;
}

const nameKey = (name: NameReading) =>
  `${foldForSearch(name.givenName)}|${foldForSearch(name.familyName)}`;

const hasContent = (text: string, separator: RegExp) =>
  text.split(separator).some((part) => part.trim() !== '');

/** Where the last separator in `text` starts, or 0. */
function lastSeparator(text: string, separator: RegExp): number {
  let at = 0;
  for (const match of text.matchAll(new RegExp(separator, 'g'))) at = match.index;
  return at;
}

/** What fits in 4000 characters and 60 entries: whole entries only, never a cut name. */
function clip(raw: string, separator: RegExp): { entries: string[]; truncated: boolean } {
  let text = raw;
  if (raw.length > PASTE_MAX_CHARS) {
    const head = raw.slice(0, PASTE_MAX_CHARS);
    // The 4001st character starting a separator means the last entry is whole.
    text = separator.test(raw.charAt(PASTE_MAX_CHARS))
      ? head
      : head.slice(0, lastSeparator(head, separator));
  }
  const all = text.split(separator);
  const lost = [raw.slice(text.length), ...all.slice(PASTE_MAX_LINES)].join('\n');
  return { entries: all.slice(0, PASTE_MAX_LINES), truncated: hasContent(lost, separator) };
}

/**
 * One affiliation per row: a class from any position wins over an organisation
 * or a parenthesis, and the first of its kind wins.
 */
function pickAffiliation(classes: readonly string[], organisations: readonly string[]) {
  return classes[0] ?? organisations[0];
}

function parseEntry(
  source: string,
  line: number,
  known: ReadonlySet<string>,
): PasteRow | Rejection {
  const { rest, inner } = takeParenthesis(commaForDash(stripBullet(source).replaceAll(';', ',')));
  const parts = rest
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const head = takeClass(words(parts[0] ?? ''));
  const classes = head.code ? [head.code] : [];
  const organisations: string[] = [];
  const note = (text: string) => {
    const tidy = affiliationOf(text);
    if (tidy) (parseClass(tidy) ? classes : organisations).push(tidy);
  };
  let core = head.rest.join(' ');
  let inverted = false;
  const titlesBefore: string[] = [];
  const titlesAfter: string[] = [];
  for (const part of parts.slice(1)) {
    if (words(part).every(isTitleAfter)) {
      titlesAfter.push(part);
      continue;
    }
    const lead = takeTitlesBefore(words(part));
    titlesBefore.push(...lead.titles);
    const text = lead.rest.join(' ');
    if (!text) continue;
    if (lead.rest.every(isTitleAfter)) titlesAfter.push(text);
    // „Novák, Jan“: a given name after a lone surname (core stops being lone, so once).
    else if (splitFullName(core, 'pan').givenName === '' && looksGiven(text)) {
      core = `${core} ${text}`;
      inverted = true;
    } else note(text);
  }
  if (inner !== undefined) note(inner);
  const affiliation = pickAffiliation(classes, organisations);
  const person = splitFullName([core, ...titlesAfter].join(', '), 'pan');
  const before = [person.titlesBefore, ...titlesBefore].filter(Boolean).join(' ');
  const all = words(`${person.givenName} ${person.familyName}`);
  if (all.length < 2 || !all.every(isNameWord)) return 'no-surname';

  const choice = chooseOrder(all, inverted);
  let name = choice.primary;
  let certain = choice.certain;
  if (!certain && known.has(nameKey(choice.primary))) certain = true;
  else if (!certain && known.has(nameKey(choice.alternate))) {
    name = choice.alternate;
    certain = true;
  }

  const row = {
    line,
    source,
    ...name,
    ...(before && { titlesBefore: before }),
    ...(person.titlesAfter && { titlesAfter: person.titlesAfter }),
    ...(affiliation && { affiliation }),
    uncertainOrder: !certain,
  };
  const tooLong =
    name.givenName.length > PERSON_FIELD_MAX.name ||
    name.familyName.length > PERSON_FIELD_MAX.name ||
    (row.titlesBefore?.length ?? 0) > PERSON_FIELD_MAX.title ||
    (row.titlesAfter?.length ?? 0) > PERSON_FIELD_MAX.title ||
    (affiliation?.length ?? 0) > PERSON_FIELD_MAX.affiliation;
  return tooLong ? 'too-long' : row;
}

/**
 * Reads a pasted list, one person per line (or per `;` when there is no line
 * break), at most 4000 characters and 60 lines; the rest is dropped and
 * `truncated` says so. `known` are people the author used before: a row whose
 * order is a guess is made certain when it, or its other order, matches one,
 * and takes the known order. Lines that are no person are `rejected`.
 */
export function parsePeopleList(input: string, known: readonly KnownName[] = []): PasteResult {
  // Composed once, so an accent typed as a separate character reads like the letter.
  const raw = input.normalize('NFC');
  const separator = /[\r\n]/.test(raw.trim()) ? /\r\n|\r|\n/ : /;/;
  const { entries, truncated } = clip(raw, separator);
  const keys = new Set(known.map(nameKey));
  const rows: PasteRow[] = [];
  const rejected: PasteRejected[] = [];
  entries.forEach((entry, index) => {
    const source = entry.trim();
    if (!source) return;
    const result = parseEntry(source, index + 1, keys);
    if (typeof result === 'string') rejected.push({ line: index + 1, code: result, source });
    else rows.push(result);
  });
  return { rows, rejected, truncated };
}
