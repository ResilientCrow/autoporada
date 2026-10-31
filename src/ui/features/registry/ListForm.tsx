'use client';

import { registry } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import type { SaveListAction } from './actions';
import { saveListInput } from './inputs';

const { fields } = registry.lists;

const SPEC: FormSpec = {
  title: {
    label: fields.title.label,
    required: true,
    messages: { 'too-long': fields.title.tooLong },
  },
  docLabel: {
    label: fields.docLabel.label,
    required: true,
    messages: { 'too-long': fields.docLabel.tooLong },
  },
  active: { label: fields.active.label },
};

/** A list as the form starts from it. */
export interface ListFormValues {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly docLabel: string;
  readonly active: boolean;
  readonly purpose: 'annex1' | 'point4';
}

/**
 * The title, the label the document prints and the switch of one list, or without `list` a new
 * point 4 list. The list of Příloha 1 cannot be switched off, so it shows a note instead.
 */
export function ListForm({
  action,
  list,
  onSaved,
}: {
  readonly action: SaveListAction;
  readonly list?: ListFormValues;
  readonly onSaved: (changed: boolean) => void;
}) {
  const locked = list?.purpose === 'annex1';
  const state = useActionForm({
    action,
    toInput: saveListInput(list ?? null, locked),
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id={list === undefined ? 'novy-seznam' : `seznam-${list.id}`} spec={SPEC} state={state}>
      <TextField name="title" defaultValue={list?.title ?? ''} />
      <TextField
        name="docLabel"
        defaultValue={list?.docLabel ?? ''}
        description={fields.docLabel.description}
      />
      {locked ? (
        <p>{registry.lists.fixed}</p>
      ) : (
        <CheckboxField name="active" optionalMark={false} defaultChecked={list?.active ?? true} />
      )}
      <SubmitButton>{list === undefined ? registry.lists.create.save : registry.save}</SubmitButton>
    </Form>
  );
}
