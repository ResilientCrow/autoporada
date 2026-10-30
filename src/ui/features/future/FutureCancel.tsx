'use client';

import { future } from '@/ui/copy';
import { CheckboxField, Form, refusalAsGone, SubmitButton, useActionForm } from '@/ui/form';

import { CANCEL_FORM_ID, CANCEL_SPEC, cancelInput, type CancelFutureAction } from './review-calls';

/**
 * „Zrušit akci“ (design section 12): an approved akce called off by its author or a reviewer, with
 * the box that must be ticked. It sends the version the page showed; the action moves the state
 * and refreshes the page, which then shows the akce as „Zrušeno“. A form of its own, so it never
 * nests in the editor's.
 */
export function FutureCancel({
  id,
  version,
  cancelFuture,
  onCancelled,
}: {
  readonly id: string;
  readonly version: number;
  readonly cancelFuture: CancelFutureAction;
  /** The host says it was cancelled. */
  readonly onCancelled: () => void;
}) {
  const state = useActionForm({
    action: cancelFuture,
    toInput: (data) => cancelInput(id, version, data),
    onSuccess: onCancelled,
  });
  return (
    <Form id={CANCEL_FORM_ID} spec={CANCEL_SPEC} state={refusalAsGone(state)}>
      <CheckboxField name="confirmed" optionalMark={false} />
      <div>
        <SubmitButton variant="secondary">{future.review.cancel.button}</SubmitButton>
      </div>
    </Form>
  );
}
