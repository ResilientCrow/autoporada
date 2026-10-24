'use client';

import type { z } from 'zod';

import type { cancelAccessInput, cancelAccessOutput, ServerAction } from '@/contracts';
import { access } from '@/ui/copy';
import { Form, SubmitButton, useActionForm } from '@/ui/form';

export type CancelAction = ServerAction<
  z.input<typeof cancelAccessInput>,
  z.output<typeof cancelAccessOutput>
>;

/** „Zrušit žádost“: sends the request and version the page showed, taken from the props. */
export function CancelForm({
  action,
  requestId,
  version,
  onCancelled,
}: {
  readonly action: CancelAction;
  readonly requestId: string;
  readonly version: number;
  readonly onCancelled: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: () => ({ requestId, version }),
    onSuccess: onCancelled,
  });
  return (
    <Form id="zrusit" spec={{}} state={state}>
      <SubmitButton variant="secondary">{access.pending.cancel}</SubmitButton>
      <p>{access.pending.cancelHint}</p>
    </Form>
  );
}
