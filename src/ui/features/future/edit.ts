import type { z } from 'zod';

import type { ActionResult, FieldIssueCode, FieldIssues, saveFutureInput } from '@/contracts';
import { ORGANIZER_ROLES, type Campus, type OrganizerRole } from '@/domain/cs';
import { fieldIssues, future, points } from '@/ui/copy';
import { pickedTime, typedDate, type FormSpec } from '@/ui/form';

/** The id of the editor's form: the ids of its controls are made from it. */
export const FUTURE_FORM_ID = 'akce';

/** An item's content as the save takes it, and as the page hands it to the editor. */
export type FutureContentWire = z.input<typeof saveFutureInput>['content'];

/** What the editor holds: the content as the save takes it. */
export interface FutureEdit {
  readonly content: FutureContentWire;
}

/** The campuses in the order the form offers them. */
export const CAMPUSES = [
  'smichov',
  'radlice',
  'na-vidouli',
  'jinde',
] as const satisfies readonly Campus[];

const roleOf = (value: string): OrganizerRole | null =>
  ORGANIZER_ROLES.find((role) => role === value) ?? null;

const campusOf = (value: string): Campus | null =>
  CAMPUSES.find((campus) => campus === value) ?? null;

/** The editor's start: the content as the page loaded it. */
export const startEdit = (content: FutureContentWire): FutureEdit => ({ content });

/** Whether the item runs over more than one day: it prints no hours then. */
export const isMultiDay = ({
  startDate,
  endDate,
}: Pick<FutureContentWire, 'startDate' | 'endDate'>) =>
  startDate !== null && endDate !== null && endDate > startDate;

export type PatchName =
  | 'title'
  | 'startDate'
  | 'endDate'
  | 'timeFrom'
  | 'timeTo'
  | 'campus'
  | 'place'
  | 'organizerRole'
  | 'organizer'
  | 'participants'
  | 'note';

/** The text of a free-text field: nothing typed is null. */
const textOrNull = (value: string): string | null => (value === '' ? null : value);

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
    case 'endDate': {
      const dates = { startDate: content.startDate, endDate: content.endDate };
      dates[name] = typedDate(value, content[name]).value;
      // A run of days has no hours: the times go when the end moves past the start.
      return isMultiDay(dates) ? { ...dates, timeFrom: null, timeTo: null } : dates;
    }
    case 'timeFrom':
    case 'timeTo':
      return { [name]: pickedTime(value, content[name]) };
    case 'campus':
      return { campus: campusOf(value) };
    case 'organizerRole':
      return { organizerRole: roleOf(value) };
    case 'place':
    case 'organizer':
    case 'participants':
    case 'note':
      return { [name]: textOrNull(value) };
  }
}

/** Whether two contents are the same to a save: a change that is not one saves nothing. */
export const sameContent = (a: FutureContentWire, b: FutureContentWire): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The edit with the patch applied to its content; the edit it was given stays as it was. */
export function withPatch(edit: FutureEdit, patch: Partial<FutureContentWire>): FutureEdit {
  return { ...edit, content: { ...edit.content, ...patch } };
}

/** The editor's fields in page order, the same for both kinds. A draft may be unfinished: the submit asks for the title and the start. */
export const FUTURE_SPEC: FormSpec = {
  title: { label: points.editor.title, required: true },
  startDate: { label: points.facts.eventDate, required: true },
  endDate: { label: points.facts.endDate, messages: { invalid: future.editor.endBeforeStart } },
  timeFrom: { label: points.facts.timeFrom },
  timeTo: { label: points.facts.timeTo, messages: { invalid: future.editor.timeTo } },
  campus: { label: points.facts.campus },
  place: { label: points.facts.place },
  organizerRole: {
    label: future.editor.organizer,
    messages: { required: future.editor.organizerRoleRequired },
  },
  organizer: { label: future.editor.organizerNames },
  participants: { label: future.editor.participants },
  note: { label: future.editor.note },
};

const PREFIX = 'content.';

/**
 * The issues of a refused save or submit as the editor's fields carry them: the contract's paths
 * lose `content.`. `unknown` is set for a path
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
    if (Object.hasOwn(FUTURE_SPEC, name)) known[name] = code;
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
      return [name, FUTURE_SPEC[name]?.messages?.[code] ?? fieldIssues[code]];
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
