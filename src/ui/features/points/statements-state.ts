import { suggestGenitive, type GenitiveSuggestion } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import {
  displayName,
  nameKey,
  participantsOf,
  POINT_LIMITS,
  samePerson,
  type DraftPerson,
  type DraftStatement,
  type PointContent,
} from '@/domain/report';
import { points } from '@/ui/copy';

import type { Edit } from './report-patch';

const { statements: copy } = points;

/** A statement the author just added. */
export const NEW_STATEMENT: DraftStatement = { speaker: null, speakerGenitive: '', quote: '' };

/** The „Kdo“ value of „Jiná osoba…“; `NONE` is the value while nobody is chosen. */
export const OTHER = 'other';
const NONE = '';

/** What a card's controls are called: the tail of the path readiness reports. */
export type StatementControl = 'speaker' | 'up' | 'down';

/** What takes focus after an operation: a control of a card (counting from zero), or „Přidat vyjádření“. */
export type StatementFocus = { readonly row: number; readonly control: StatementControl } | 'add';

/** What the author asks of the cards. */
export type StatementOp =
  | { readonly kind: 'add' }
  | { readonly kind: 'remove'; readonly index: number }
  | { readonly kind: 'up' | 'down'; readonly index: number };

export type StatementApplied<T> =
  | { readonly ok: true; readonly list: readonly T[]; readonly focus: StatementFocus }
  | { readonly ok: false; readonly code: 'limit' | 'unknown' };

/**
 * One add, removal or move of a card, with where focus goes: an add to the new card's
 * „Kdo“, a removal to the next card's „Kdo“ (the previous one when it was the last, the
 * add button when none is left), a move to the button that moved, one place on. A move
 * past an end changes nothing and hands back the very list it was given. It works on any
 * list, so the cards' keys can follow the statements through the same operation.
 */
export function applyStatementOp<T>(
  list: readonly T[],
  op: StatementOp,
  fresh: T,
): StatementApplied<T> {
  if (op.kind === 'add') {
    if (list.length >= POINT_LIMITS.statements) return { ok: false, code: 'limit' };
    return { ok: true, list: [...list, fresh], focus: { row: list.length, control: 'speaker' } };
  }
  const { index } = op;
  if (index < 0 || index >= list.length) return { ok: false, code: 'unknown' };
  if (op.kind === 'remove') {
    const left = list.filter((_, i) => i !== index);
    const row = Math.min(index, left.length - 1);
    return { ok: true, list: left, focus: row < 0 ? 'add' : { row, control: 'speaker' } };
  }
  const target = index + (op.kind === 'up' ? -1 : 1);
  if (target < 0 || target >= list.length) {
    return { ok: true, list, focus: { row: index, control: op.kind } };
  }
  const moved = list.filter((_, i) => i !== index);
  moved.splice(target, 0, list[index] as T);
  return { ok: true, list: moved, focus: { row: target, control: op.kind } };
}

/** A participant's „Kdo“ value: stable through bullet edits, since it is the person's own id or name. */
export function optionValue(person: DraftPerson): string {
  return person.graphId === undefined ? `name:${nameKey(person)}` : `id:${person.graphId}`;
}

/** The „Kdo“ options: the participants, then „Jiná osoba…“, and „Vyberte…“ first while nobody is chosen. */
export function speakerOptions(
  participants: readonly DraftPerson[],
  selected: string,
): { readonly value: string; readonly label: string }[] {
  return [
    ...(selected === NONE ? [{ value: NONE, label: copy.choose }] : []),
    ...participants.map((p) => ({ value: optionValue(p), label: displayName(p) })),
    { value: OTHER, label: copy.other },
  ];
}

/**
 * The option „Kdo“ shows: the participant who is the speaker, „Jiná osoba…“ for any other
 * speaker (and, with none yet, once the author asked for it), else nothing chosen.
 */
export function selectedOption(
  statement: DraftStatement,
  participants: readonly DraftPerson[],
  wantsOther: boolean,
): string {
  const { speaker } = statement;
  if (speaker === null) return wantsOther ? OTHER : NONE;
  const found = participants.find((p) => samePerson(p, speaker));
  return found === undefined ? OTHER : optionValue(found);
}

/** The genitive the rules suggest for a speaker; none while they have no salutation. */
function suggestionFor(
  person: DraftPerson,
  recents: readonly RecentPerson[],
): GenitiveSuggestion | null {
  const { salutation } = person;
  if (salutation === null) return null;
  const override = recents.find((r) => samePerson(r, person))?.genitive;
  return suggestGenitive({ ...person, salutation }, override);
}

/**
 * The affiliation is the author's own once they typed something that is not the speaker's.
 * Until then (empty, or the speaker's own) it follows the speaker, as the genitive does.
 */
function followsSpeaker(statement: DraftStatement): boolean {
  const current = statement.affiliation ?? '';
  return current.trim() === '' || current === statement.speaker?.affiliation;
}

/** The statement with its affiliation set to `next` ('' for none) while it follows the speaker; else as it was. */
function withFollowedAffiliation(
  statement: DraftStatement,
  next: string | undefined,
): DraftStatement {
  const wanted = next ?? '';
  if (!followsSpeaker(statement) || wanted === (statement.affiliation ?? '')) return statement;
  return { ...statement, affiliation: wanted };
}

/** The statement with `person` as its speaker, the genitive suggested, and an untouched class or function theirs. */
export function chooseSpeaker(
  statement: DraftStatement,
  person: DraftPerson,
  recents: readonly RecentPerson[],
): DraftStatement {
  return {
    ...withFollowedAffiliation(statement, person.affiliation),
    speaker: person,
    speakerGenitive: suggestionFor(person, recents)?.text ?? '',
  };
}

/** The statement with no speaker: the genitive goes, and so does a class or function that was the speaker's. */
function withoutSpeaker(statement: DraftStatement): DraftStatement {
  return {
    ...withFollowedAffiliation(statement, undefined),
    speaker: null,
    speakerGenitive: '',
  };
}

/** The statement after the author picked `value` in „Kdo“. */
export function pickSpeaker(
  statement: DraftStatement,
  value: string,
  participants: readonly DraftPerson[],
  recents: readonly RecentPerson[],
): DraftStatement {
  if (value === OTHER) {
    const stays =
      statement.speaker === null || selectedOption(statement, participants, false) === OTHER;
    return stays ? statement : withoutSpeaker(statement);
  }
  const found = participants.find((p) => optionValue(p) === value);
  return found === undefined ? statement : chooseSpeaker(statement, found, recents);
}

/**
 * What to say under „Ve 2. pádě“: to choose a salutation first, or to check a suggestion
 * the rules are unsure of while the field still holds it. Worked out at render, never stored.
 */
export function genitiveNote(
  statement: DraftStatement,
  recents: readonly RecentPerson[],
): string | null {
  const { speaker, speakerGenitive } = statement;
  if (speaker === null) return null;
  if (speaker.salutation === null) return speakerGenitive === '' ? copy.needSalutation : null;
  const suggestion = suggestionFor(speaker, recents);
  return suggestion?.needsCheck && suggestion.text === speakerGenitive
    ? copy.check(suggestion.text)
    : null;
}

/**
 * The statement with the speaker's copy brought up to `current`, the same person's
 * newest fields. The genitive is made again only while it is empty or still the
 * suggestion built from the old copy, and the class or function only while it is empty or
 * still the old copy's: an author's correction is never overwritten.
 */
function refreshed(
  statement: DraftStatement,
  current: DraftPerson,
  recents: readonly RecentPerson[],
): DraftStatement {
  const { speaker } = statement;
  if (speaker === null || current === speaker) return statement;
  const untouched =
    statement.speakerGenitive === '' ||
    statement.speakerGenitive === suggestionFor(speaker, recents)?.text;
  return {
    ...withFollowedAffiliation(statement, current.affiliation),
    speaker: current,
    ...(untouched && { speakerGenitive: suggestionFor(current, recents)?.text ?? '' }),
  };
}

/** The statement after the people field of „Jiná osoba…“ changed: no one, the same person edited, or another person. */
export function setSpeaker(
  statement: DraftStatement,
  person: DraftPerson | null,
  recents: readonly RecentPerson[],
): DraftStatement {
  if (person === null) return withoutSpeaker(statement);
  if (statement.speaker !== null && samePerson(statement.speaker, person)) {
    return refreshed(statement, person, recents);
  }
  return chooseSpeaker(statement, person, recents);
}

/** One statement after the participants may have changed. */
function synced(
  statement: DraftStatement,
  participants: readonly DraftPerson[],
  recents: readonly RecentPerson[],
): DraftStatement {
  const { speaker } = statement;
  if (speaker === null) return statement;
  const current = participants.find((p) => samePerson(p, speaker));
  return current === undefined ? statement : refreshed(statement, current, recents);
}

/**
 * Brings every statement whose speaker is still a participant up to the participant's
 * current fields (so a salutation chosen later on the chip reaches it). Its genitive is
 * made again only while it is empty or still the suggestion built from the old copy: an
 * author's correction is never overwritten. The very content comes back when nothing changes.
 */
export function syncSpeakers<C extends Pick<PointContent, 'bullets' | 'statements'>>(
  content: C,
  recents: readonly RecentPerson[],
): C {
  const participants = participantsOf(content);
  const statements = content.statements.map((s) => synced(s, participants, recents));
  return statements.every((s, i) => s === content.statements[i])
    ? content
    : { ...content, statements };
}

/**
 * `syncSpeakers` for the editor's change path: it runs only after a change to the bullets,
 * so a genitive the author clears by hand to retype is not filled in again under them.
 */
export function withSyncedSpeakers(
  before: Edit,
  changed: Edit,
  recents: readonly RecentPerson[],
): Edit {
  if (changed.content.bullets === before.content.bullets) return changed;
  const content = syncSpeakers(changed.content, recents);
  return content === changed.content ? changed : { ...changed, content };
}

/** Opening and closing quotation marks people paste or type around a quote: „ “ " ” '. */
const MARKS = new Set(['„', '“', '"', '”', "'"]);

/**
 * A quote without the marks around it: one at the start and one at the end, whatever
 * kind, and the spaces around the text. The text inside is never touched.
 */
export function unquoted(text: string): string {
  const trimmed = text.trim();
  const start = MARKS.has(trimmed.charAt(0)) ? 1 : 0;
  const end =
    trimmed.length > start && MARKS.has(trimmed.charAt(trimmed.length - 1)) ? -1 : undefined;
  return trimmed.slice(start, end).trim();
}

/** The statement with the marks around its quote taken off; the very statement when there are none. */
export function unquotedStatement(statement: DraftStatement): DraftStatement {
  const quote = unquoted(statement.quote);
  return quote === statement.quote ? statement : { ...statement, quote };
}
