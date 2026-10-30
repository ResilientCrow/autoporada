'use client';

import { future } from '@/ui/copy';
import { Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import type { RetractFutureAction } from './actions';
import { retractInput } from './calls';

const FORM_ID = 'akce-stahnout';
const HINT_ID = `${FORM_ID}-napoveda`;
const SPEC: FormSpec = {};

/**
 * „Stáhnout“ (design section 12): the author takes a submitted item back to the drafts before
 * anyone decided. It sends the version the page showed; the action moves the state, so the page
 * refreshes and shows the editor.
 */
export function FutureRetract({
  id,
  version,
  retractFuture,
}: {
  readonly id: string;
  readonly version: number;
  readonly retractFuture: RetractFutureAction;
}) {
  const state = useActionForm({
    action: retractFuture,
    toInput: () => retractInput(id, version),
  });
  return (
    <Form id={FORM_ID} spec={SPEC} state={state}>
      <p id={HINT_ID}>{future.editor.retract.hint}</p>
      <div>
        <SubmitButton variant="secondary" describedBy={HINT_ID}>
          {future.editor.retract.button}
        </SubmitButton>
      </div>
    </Form>
  );
}
