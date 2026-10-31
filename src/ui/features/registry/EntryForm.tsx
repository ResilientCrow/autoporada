'use client';

import { registry } from '@/ui/copy';
import { Form, SubmitButton, TextField, useActionForm, type FormSpec } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { AddEntriesAction, SaveEntryAction } from './actions';
import { addEntryInput, saveEntryInput } from './inputs';

const { fields } = registry.entries;

/** The three fields' spec; the add form posts them as `rows.0.*`, the edit form plainly. */
function specFor(prefix: string): FormSpec {
  return {
    [`${prefix}givenName`]: {
      label: fields.givenName.label,
      required: true,
      messages: { 'too-long': fields.givenName.tooLong },
    },
    [`${prefix}familyName`]: {
      label: fields.familyName.label,
      required: true,
      messages: { 'too-long': fields.familyName.tooLong },
    },
    [`${prefix}classCode`]: {
      label: fields.classCode.label,
      required: true,
      messages: { invalid: fields.classCode.invalid, 'too-long': fields.classCode.invalid },
    },
  };
}

function Fields({
  prefix,
  values,
}: {
  readonly prefix: string;
  readonly values?: {
    readonly givenName: string;
    readonly familyName: string;
    readonly classCode: string;
  };
}) {
  return (
    <>
      <TextField name={`${prefix}givenName`} defaultValue={values?.givenName ?? ''} />
      <TextField name={`${prefix}familyName`} defaultValue={values?.familyName ?? ''} />
      <TextField
        name={`${prefix}classCode`}
        defaultValue={values?.classCode ?? ''}
        description={fields.classCode.description}
      />
    </>
  );
}

/** „Přidat studenta“: one student on the list; the new form is keyed by the host after a save. */
export function AddEntryForm({
  action,
  listId,
  onAdded,
}: {
  readonly action: AddEntriesAction;
  readonly listId: string;
  readonly onAdded: () => void;
}) {
  const state = useActionForm({ action, toInput: addEntryInput(listId), onSuccess: onAdded });
  return (
    <Form id="novy-student" spec={specFor('rows.0.')} state={state}>
      <Fields prefix="rows.0." />
      <SubmitButton>{registry.entries.add.save}</SubmitButton>
    </Form>
  );
}

/** „Upravit“ of one student under the version the row was read at. */
export function EditEntryForm({
  action,
  entry,
  onSaved,
  onCancel,
}: {
  readonly action: SaveEntryAction;
  readonly entry: {
    readonly id: string;
    readonly version: number;
    readonly givenName: string;
    readonly familyName: string;
    readonly classCode: string;
  };
  readonly onSaved: (changed: boolean) => void;
  readonly onCancel: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: saveEntryInput(entry.id, entry.version),
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id={`student-${entry.id}`} spec={specFor('')} state={state}>
      <Fields prefix="" values={entry} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>{registry.save}</SubmitButton>
        <Button variant="secondary" onPress={onCancel}>
          {registry.entries.cancel}
        </Button>
      </div>
    </Form>
  );
}
