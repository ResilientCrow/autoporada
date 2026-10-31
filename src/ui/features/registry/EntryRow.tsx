'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { Form, SubmitButton, useActionForm } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { RemoveEntryAction, SaveEntryAction } from './actions';
import { EditEntryForm } from './EntryForm';
import { removeEntryInput } from './inputs';
import { NewChip } from './NewChip';

export interface EntryView {
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly classCode: string;
  readonly version: number;
  readonly isNew: boolean;
}

function RemoveForm({
  action,
  entry,
  onRemoved,
}: {
  readonly action: RemoveEntryAction;
  readonly entry: EntryView;
  readonly onRemoved: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: removeEntryInput(entry.id),
    onSuccess: onRemoved,
  });
  return (
    <Form id={`odebrat-${entry.id}`} spec={{}} state={state}>
      <SubmitButton variant="secondary">
        {registry.entries.remove}
        <span className="sr-only">
          {registry.entries.about(`${entry.familyName} ${entry.givenName}`)}
        </span>
      </SubmitButton>
    </Form>
  );
}

/**
 * One student of the list: the class and the name, the „NOVÉ“ chip, and for the headmaster
 * „Upravit“ and „Odebrat“. The host keys the row by the entry's version, so a saved row starts
 * again from the saved values.
 */
export function EntryRow({
  entry,
  editable,
  saveEntry,
  removeEntry,
  onSaved,
  onRemoved,
}: {
  readonly entry: EntryView;
  readonly editable: boolean;
  readonly saveEntry: SaveEntryAction;
  readonly removeEntry: RemoveEntryAction;
  readonly onSaved: (changed: boolean) => void;
  readonly onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const name = `${entry.familyName} ${entry.givenName}`;
  if (editing) {
    return (
      <EditEntryForm
        action={saveEntry}
        entry={entry}
        onSaved={(changed) => {
          setEditing(false);
          onSaved(changed);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-bold">{entry.classCode}</span>
      <span>{name}</span>
      {entry.isNew && <NewChip />}
      {editable && (
        <div className="ml-auto flex flex-wrap gap-3">
          <Button variant="secondary" onPress={() => setEditing(true)}>
            {registry.entries.edit}
            <span className="sr-only">{registry.entries.about(name)}</span>
          </Button>
          <RemoveForm action={removeEntry} entry={entry} onRemoved={onRemoved} />
        </div>
      )}
    </div>
  );
}
