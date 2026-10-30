'use client';

import { future } from '@/ui/copy';
import { CheckboxField, Form, refusalAsGone, SubmitButton, useActionForm } from '@/ui/form';

import { CANCEL_FORM_ID, CANCEL_SPEC, cancelInput, type CancelFutureAction } from './review-calls';

const HEADING_ID = `${CANCEL_FORM_ID}-nadpis`;

/**
 * „Zrušit položku“ (design section 12): an approved item called off by its author or a reviewer,
 * with the box that must be ticked, in a section of its own apart from the decisions (ADR 0013
 * item 10). It sends the version the page showed; the action moves the state and refreshes the
 * page, which then shows the item as „Zrušeno“. A form of its own, so it never nests in the
 * editor's.
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
    <section aria-labelledby={HEADING_ID} className="space-y-3 border-t-2 border-ink pt-4">
      <h2 id={HEADING_ID} className="font-semibold">
        {future.review.cancel.heading}
      </h2>
      <Form id={CANCEL_FORM_ID} spec={CANCEL_SPEC} state={refusalAsGone(state)}>
        <CheckboxField name="confirmed" optionalMark={false} />
        <div>
          <SubmitButton variant="secondary">{future.review.cancel.button}</SubmitButton>
        </div>
      </Form>
    </section>
  );
}
