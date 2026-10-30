'use client';

import type { RecentPerson } from '@/domain/people';
import { POINT_LIMITS } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { future } from '@/ui/copy';
import {
  fieldId,
  NativeFieldError,
  PeopleField,
  SelectField,
  TextField,
  type Chip,
  type Directory,
} from '@/ui/form';

import { FUTURE_FORM_ID, VERBS, verbOf, type ResponsibleDraft } from './edit';

const { responsible: copy } = future.editor;
const VERB_OPTIONS = VERBS.map((verb) => ({ value: verb, label: copy.verbs[verb] }));
const PEOPLE_ID = fieldId(FUTURE_FORM_ID, 'responsible.people');

/** What the people field needs from the page. */
export interface PickerContext {
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

/**
 * „Kdo to zajišťuje“: a fieldset of the verb („Koordinují“), the group the people act for, and
 * the people themselves. While the editor is held the fieldset is disabled, which takes every
 * control in it out of reach at once. `issues` holds the messages of the last refused save.
 */
export function ResponsibleFields({
  value,
  issues,
  readOnly,
  picker,
  onChange,
  onBlur,
}: {
  readonly value: ResponsibleDraft;
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly picker: PickerContext;
  readonly onChange: (change: Partial<ResponsibleDraft>) => void;
  /** Leaving a text field saves at once. */
  readonly onBlur: () => void;
}) {
  const message = issues['responsible.people'];
  return (
    <fieldset
      id={PEOPLE_ID}
      tabIndex={-1}
      disabled={readOnly}
      aria-describedby={message === undefined ? undefined : `${PEOPLE_ID}-error`}
      className="flex min-w-0 flex-col gap-3 rounded-brand border-2 border-ink p-3"
    >
      <legend className="px-1 font-bold">{copy.legend}</legend>
      <p>{copy.hint}</p>
      {message === undefined ? null : (
        <NativeFieldError id={`${PEOPLE_ID}-error`} message={message} />
      )}
      <SelectField
        name="responsible.verb"
        options={VERB_OPTIONS}
        value={value.verb}
        onChange={(verb) => onChange({ verb: verbOf(verb) })}
        issue={issues['responsible.verb']}
      />
      <TextField
        name="responsible.behalfOf"
        value={value.behalfOf}
        description={copy.behalfOfHint}
        maxLength={POINT_LIMITS.person.affiliation}
        autoComplete="off"
        onChange={(behalfOf) => onChange({ behalfOf })}
        onBlur={onBlur}
        readOnly={readOnly}
        issue={issues['responsible.behalfOf']}
      />
      <PeopleField
        label={copy.add}
        listLabel={copy.list}
        value={value.people}
        onChange={(people: readonly Chip[]) => onChange({ people })}
        limit={POINT_LIMITS.responsiblePeople}
        {...picker}
      />
    </fieldset>
  );
}
