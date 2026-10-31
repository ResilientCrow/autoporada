'use client';

import type { z } from 'zod';

import type { previewPasteOutput } from '@/contracts';
import { registry } from '@/ui/copy';
import {
  Form,
  SelectField,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import type { PreviewPasteAction } from './actions';
import { previewPasteFor } from './inputs';

const { paste } = registry;

const SPEC: FormSpec = {
  text: { label: paste.text.label, required: true, messages: { 'too-long': paste.text.tooLong } },
  order: { label: paste.order.label },
};

const ORDER_OPTIONS = [
  { value: 'given-family', label: paste.order.givenFamily },
  { value: 'family-given', label: paste.order.familyGiven },
];

export type PreviewRows = z.output<typeof previewPasteOutput>['rows'];

/** The pasted text and the order of the names; „Zkontrolovat“ asks the server what it would add. */
export function PasteForm({
  action,
  listId,
  onRows,
}: {
  readonly action: PreviewPasteAction;
  readonly listId: string;
  readonly onRows: (rows: PreviewRows) => void;
}) {
  const state = useActionForm({
    action,
    toInput: previewPasteFor(listId),
    onSuccess: (value) => onRows(value.rows),
  });
  return (
    <Form id="vlozit" spec={SPEC} state={state}>
      <p>{paste.intro}</p>
      <TextField name="text" multiline description={paste.text.description} />
      <SelectField name="order" options={ORDER_OPTIONS} defaultValue="given-family" />
      <SubmitButton>{paste.check}</SubmitButton>
    </Form>
  );
}
