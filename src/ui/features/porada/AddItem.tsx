'use client';

import { useState } from 'react';

import { porada } from '@/ui/copy';
import {
  Form,
  RadioGroupField,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { ArrowLink } from '@/ui/kit';

import { addInput, type OutlineAddAction, type OutlineSectionKey } from './outline';

const { add, persistence, fields } = porada.outline;

const SPEC: FormSpec = {
  title: { label: add.name, required: true },
  persistence: { label: add.persistence, required: true },
  monday: { label: porada.outline.title, messages: { invalid: fields.stale } },
};

/**
 * „Přidat bod“ at the end of a section: a title and whether the item carries to the next porada.
 * Its text is written in the item's editor. The id of the item is made once per form, so a
 * retry adds it once; the host keys the form by the number of items added, so it starts again.
 */
export function AddItem({
  action,
  monday,
  version,
  section,
  onAdded,
}: {
  readonly action: OutlineAddAction;
  readonly monday: string;
  readonly version: number | null;
  readonly section: OutlineSectionKey;
  readonly onAdded: () => void;
}) {
  const [lineageId] = useState(() => crypto.randomUUID());
  const state = useActionForm({
    action,
    toInput: addInput(monday, version, section, lineageId),
    onSuccess: onAdded,
  });
  return (
    <Form id={`pridat-${section}`} spec={SPEC} state={state}>
      <TextField name="title" />
      <RadioGroupField
        name="persistence"
        defaultValue="once"
        options={[
          { value: 'once', label: persistence.once },
          { value: 'standing', label: persistence.standing },
        ]}
      />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{add.submit}</SubmitButton>
        <ArrowLink href={`/porada/${monday}/pokyny/nova?cast=${section}`}>{add.withText}</ArrowLink>
      </div>
    </Form>
  );
}
