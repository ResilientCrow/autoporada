'use client';

import type { KeyboardEvent, RefCallback } from 'react';

import { SALUTATION, SALUTATIONS } from '@/domain/cs';
import type { DraftPerson } from '@/domain/report';
import { PERSON_FIELD_MAX } from '@/domain/report';
import { people } from '@/ui/copy';
import { buttonStyles } from '@/ui/kit';

import { FormProvider } from '../context';
import { SelectField } from '../SelectField';
import type { FormSpec } from '../spec';
import { TextField } from '../TextField';

import type { ChipButton, Fields } from './chips-state';
import { spokenName } from './directory-state';

const { editor: copy } = people.chips;

/** The editor's fields: the labels and the problems come from one declaration, like any form. */
const SPEC: FormSpec = {
  salutation: { label: copy.salutation, required: true },
  affiliation: { label: copy.affiliation },
  givenName: { label: copy.givenName, required: true },
  familyName: { label: copy.familyName, required: true },
  titlesBefore: { label: copy.titlesBefore },
  titlesAfter: { label: copy.titlesAfter },
};

const SALUTATION_OPTIONS = [
  { value: '', label: copy.none },
  ...SALUTATIONS.map((value) => ({ value, label: SALUTATION[value].label })),
];

/**
 * The inline editor below a chip (design section 5): native controls through
 * the form kit, each change written to the field at once. An empty given name
 * or surname is a problem of its field (`issues`), and Hotovo keeps the editor
 * open on it. Enter in a text field is Hotovo, so an enclosing form is not sent.
 */
export function ChipEditor({
  id,
  person,
  issues,
  register,
  onPatch,
  onSettleClass,
  onConfirmClass,
  onMove,
  onDone,
}: {
  readonly id: string;
  readonly person: DraftPerson;
  readonly issues: Readonly<Record<string, 'required'>> | null;
  readonly register: (button: ChipButton) => RefCallback<HTMLButtonElement>;
  readonly onPatch: (patch: Partial<Fields>) => void;
  readonly onSettleClass: () => void;
  readonly onConfirmClass: () => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onDone: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    onDone();
  }

  return (
    <FormProvider value={{ formId: id, spec: SPEC, issues, submitting: null }}>
      <div
        id={id}
        role="group"
        aria-label={people.chips.editorLabel(spokenName(person))}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-3 border-t-2 border-ink pt-3"
      >
        <SelectField
          name="salutation"
          options={SALUTATION_OPTIONS}
          value={person.salutation ?? ''}
          onChange={(value) =>
            onPatch({ salutation: SALUTATIONS.find((s) => s === value) ?? null })
          }
        />
        <TextField
          name="affiliation"
          value={person.affiliation ?? ''}
          maxLength={PERSON_FIELD_MAX.affiliation}
          onChange={(affiliation) => onPatch({ affiliation })}
          onBlur={onSettleClass}
        />
        {person.affiliation === undefined ? null : (
          <div>
            <button type="button" onClick={onConfirmClass} className={buttonStyles('secondary')}>
              {copy.classValid}
            </button>
          </div>
        )}
        <TextField
          name="givenName"
          value={person.givenName}
          maxLength={PERSON_FIELD_MAX.name}
          onChange={(givenName) => onPatch({ givenName })}
        />
        <TextField
          name="familyName"
          value={person.familyName}
          maxLength={PERSON_FIELD_MAX.name}
          onChange={(familyName) => onPatch({ familyName })}
        />
        <TextField
          name="titlesBefore"
          value={person.titlesBefore ?? ''}
          maxLength={PERSON_FIELD_MAX.title}
          onChange={(titlesBefore) => onPatch({ titlesBefore })}
        />
        <TextField
          name="titlesAfter"
          value={person.titlesAfter ?? ''}
          maxLength={PERSON_FIELD_MAX.title}
          onChange={(titlesAfter) => onPatch({ titlesAfter })}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            ref={register('up')}
            onClick={() => onMove(-1)}
            className={buttonStyles('secondary')}
          >
            {copy.up}
          </button>
          <button
            type="button"
            ref={register('down')}
            onClick={() => onMove(1)}
            className={buttonStyles('secondary')}
          >
            {copy.down}
          </button>
          <button type="button" onClick={onDone} className={buttonStyles('primary')}>
            {copy.done}
          </button>
        </div>
      </div>
    </FormProvider>
  );
}
