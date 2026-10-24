'use client';

import type { ServerAction } from '@/contracts';
import { access } from '@/ui/copy';
import { Form, SubmitButton, useActionForm } from '@/ui/form';

/** „Zrušit žádost“: sends the request and version the page showed, taken from the props. */
export function CancelForm({
  action,
  requestId,
  version,
  onCancelled,
}: {
  readonly action: ServerAction<
    { readonly requestId: string; readonly version: number },
    Record<string, never>
  >;
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
