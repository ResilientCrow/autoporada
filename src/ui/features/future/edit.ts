import type { z } from 'zod';

import type { ActionResult, FieldIssueCode, FieldIssues, saveFutureInput } from '@/contracts';
import type { Campus, ResponsibleVerb } from '@/domain/cs';
import { fieldIssues, future, points } from '@/ui/copy';
import { pickedTime, typedDate, type Chip, type FormSpec } from '@/ui/form';

/** The id of the editor's form: the ids of its controls are made from it. */
export const FUTURE_FORM_ID = 'akce';

/** An item's content as the save takes it, and as the page hands it to the editor. */
export type FutureContentWire = z.input<typeof saveFutureInput>['content'];

/** Who is responsible as the editor holds it: the people as chips, the behalf-of as typed. */
export interface ResponsibleDraft {
  readonly verb: ResponsibleVerb;
  readonly behalfOf: string;
  readonly people: readonly Chip[];
}

/** What the editor holds: the content as the save takes it, and the responsible people as the field edits them. */
export interface FutureEdit {
  readonly content: FutureContentWire;
  readonly responsible: ResponsibleDraft;
}

/** The verbs in the order the form offers them. */
export const VERBS = [
  'organizuje',
  'koordinuje',
  'zajišťuje',
  'vede',
] as const satisfies readonly ResponsibleVerb[];

/** The campuses in the order the form offers them. */
export const CAMPUSES = [
  'smichov',
  'radlice',
  'na-vidouli',
  'jinde',
] as const satisfies readonly Campus[];

/** The verb a select's value names; the first for any other text. */
export const verbOf = (value: string): ResponsibleVerb =>
  VERBS.find((verb) => verb === value) ?? VERBS[0];

const campusOf = (value: string): Campus | null =>
  CAMPUSES.find((campus) => campus === value) ?? null;

/**
 * The editor's start: the people keyed by their place (not a random id: the key reaches the
 * markup as an id, so the server's render and the browser's agree), nobody responsible being the
 * first verb and no behalf-of.
 */
export function startEdit(content: FutureContentWire): FutureEdit {
  const { responsible } = content;
  return {
    content,
    responsible: {
      verb: responsible?.verb ?? VERBS[0],
      behalfOf: responsible?.behalfOf ?? '',
      people: (responsible?.people ?? []).map((person, i) => ({ key: `r.${i}`, person })),
    },
  };
}

/** What the save takes of the responsible draft: nothing while nobody and no behalf-of is named. */
export function responsibleWire(draft: ResponsibleDraft): FutureContentWire['responsible'] {
  if (draft.people.length === 0 && draft.behalfOf === '') return null;
  return {
    verb: draft.verb,
    ...(draft.behalfOf !== '' && { behalfOf: draft.behalfOf }),
    people: draft.people.map((chip) => chip.person),
  };
}

export type PatchName =
  'title' | 'startDate' | 'endDate' | 'timeFrom' | 'timeTo' | 'campus' | 'place';

/**
 * What a control's new value does to the content: the patch for the field named `name`. A date or
 * time the server would refuse leaves the field as `content` has it.
 */
export function patchFor(
  name: PatchName,
  value: string,
  content: FutureContentWire,
): Partial<FutureContentWire> {
  switch (name) {
    case 'title':
      return { title: value };
    case 'startDate':
    case 'endDate':
      return { [name]: typedDate(value, content[name]).value };
    case 'timeFrom':
    case 'timeTo':
      return { [name]: pickedTime(value, content[name]) };
    case 'campus':
      return { campus: campusOf(value) };
    case 'place':
      return { place: value === '' ? null : value };
  }
}

/** Whether two contents are the same to a save: a change that is not one saves nothing. */
export const sameContent = (a: FutureContentWire, b: FutureContentWire): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The edit with the patch applied to its content; the edit it was given stays as it was. */
export function withPatch(edit: FutureEdit, patch: Partial<FutureContentWire>): FutureEdit {
  return { ...edit, content: { ...edit.content, ...patch } };
}

/** The edit after a change to who is responsible, the content following it. */
export function withResponsible(edit: FutureEdit, change: Partial<ResponsibleDraft>): FutureEdit {
  const responsible = { ...edit.responsible, ...change };
  return { responsible, content: { ...edit.content, responsible: responsibleWire(responsible) } };
}

const who = future.editor.responsible;
/** The editor's fields in page order, the same for both kinds. A draft may be unfinished: the submit asks for the title and the start. */
export const FUTURE_SPEC: FormSpec = {
  title: { label: points.editor.title, required: true },
  startDate: { label: points.facts.eventDate, required: true },
  endDate: { label: points.facts.endDate, messages: { invalid: future.editor.endBeforeStart } },
  timeFrom: { label: points.facts.timeFrom },
  timeTo: { label: points.facts.timeTo, messages: { invalid: future.editor.timeTo } },
  campus: { label: points.facts.campus },
  place: { label: points.facts.place },
  'responsible.verb': { label: who.verb, required: true },
  'responsible.behalfOf': { label: who.behalfOf },
  'responsible.people': { label: who.people },
};

const PREFIX = 'content.';
/** A path into one person of the responsible list. */
const PERSON = /^responsible\.people\.\d+\./;

/**
 * The issues of a refused save or submit as the editor's fields carry them: the contract's paths
 * lose `content.`, and a person's missing part is the people field's. `unknown` is set for a path
 * with no field here (the content over its size cap, a field the editor does not have), which
 * becomes the generic problem.
 */
export function issuesOf(fields: FieldIssues): {
  readonly known: FieldIssues;
  readonly unknown: boolean;
} {
  const known: Record<string, FieldIssueCode> = {};
  let unknown = Object.keys(fields).length === 0;
  for (const [path, code] of Object.entries(fields)) {
    const name = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '';
    const person = PERSON.test(name);
    const field = person ? 'responsible.people' : name;
    if (Object.hasOwn(FUTURE_SPEC, field)) known[field] = person ? 'required' : code;
    else unknown = true;
  }
  return { known, unknown };
}

/** The message under each refused field, as an autosave shows it (no summary, no focus). */
export function messagesOf(
  known: FieldIssues,
  content: FutureContentWire,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(known).map(([name, code]) => {
      if (name === 'endDate') {
        const missing = content.startDate === null;
        return [name, missing ? future.editor.endWithoutStart : future.editor.endBeforeStart];
      }
      if (name === 'timeTo') return [name, future.editor.timeTo];
      if (name === 'responsible.people' && code === 'too-long')
        return [name, future.editor.tooMany];
      return [name, fieldIssues[code]];
    }),
  );
}

/**
 * The issues to keep after a save: the newest refusal replaces the older, a saved answer clears
 * them, and any other answer says nothing about the text, so they stay.
 */
export function refusedAfter(
  previous: FieldIssues | null,
  result: ActionResult<{ readonly version: number }>,
): FieldIssues | null {
  if (result.ok) return null;
  return result.error.code === 'invalid-input' ? result.error.fields : previous;
}
