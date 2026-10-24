'use client';

import type { z } from 'zod';

import type { requestAccessInput, requestAccessOutput, ServerAction } from '@/contracts';
import { access } from '@/ui/copy';
import { Form, SubmitButton, TextField, useActionForm, type FormSpec } from '@/ui/form';

import { requestInput } from './inputs';

const SPEC: FormSpec = {
  reason: {
    label: access.open.reason.label,
    required: true,
    messages: { 'too-long': access.open.reason.tooLong },
  },
};

export type RequestAction = ServerAction<
  z.input<typeof requestAccessInput>,
  z.output<typeof requestAccessOutput>
>;

/** The request form of the open state. No HTML `maxLength`: the server decides what is too long. */
export function RequestForm({
  action,
  onSent,
}: {
  readonly action: RequestAction;
  readonly onSent: () => void;
}) {
  const state = useActionForm({ action, toInput: requestInput, onSuccess: onSent });
  return (
    <Form id="zadost" spec={SPEC} state={state}>
      <TextField name="reason" multiline description={access.open.reason.description} />
      <SubmitButton>{access.open.send}</SubmitButton>
      <p>{access.open.note}</p>
    </Form>
  );
}
