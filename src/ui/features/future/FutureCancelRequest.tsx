'use client';

import { useState } from 'react';

import { future } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  NoteField,
  refusalAsGone,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import {
  DECISION_SPEC,
  cancelInput,
  refuseCancelInput,
  type RefuseCancelFutureAction,
  type RequestCancelFutureAction,
  type RetractCancelFutureAction,
} from './review-calls';

const { cancelRequest } = future.review;

const REQUEST_FORM_ID = 'akce-pozadat-o-zruseni';
const RETRACT_FORM_ID = 'akce-vzit-zadost-zpet';
const REFUSE_FORM_ID = 'akce-zamitnout-zruseni';
const EMPTY_SPEC: FormSpec = {};
/** The box that must be ticked before the request goes to the vedení. */
const REQUEST_SPEC: FormSpec = {
  confirmed: {
    label: cancelRequest.confirm,
    required: true,
    messages: { required: cancelRequest.unconfirmed },
  },
};

/**
 * „Požádat o zrušení“ (ADR 0062): the author outside the vedení asks for an approved item to be
 * called off. The item stays approved until the vedení decides. A form of its own, so it never
 * nests in the editor's.
 */
export function FutureCancelRequest({
  id,
  version,
  requestCancelFuture,
  onRequested,
}: {
  readonly id: string;
  readonly version: number;
  readonly requestCancelFuture: RequestCancelFutureAction;
  readonly onRequested: () => void;
}) {
  const state = useActionForm({
    action: requestCancelFuture,
    toInput: (data) => cancelInput(id, version, data),
    onSuccess: onRequested,
  });
  return (
    <section
      aria-labelledby={`${REQUEST_FORM_ID}-nadpis`}
      className="space-y-3 border-t-2 border-ink pt-4"
    >
      <h2 id={`${REQUEST_FORM_ID}-nadpis`} className="font-semibold">
        {cancelRequest.heading}
      </h2>
      <Form id={REQUEST_FORM_ID} spec={REQUEST_SPEC} state={refusalAsGone(state)}>
        <CheckboxField name="confirmed" optionalMark={false} />
        <div>
          <SubmitButton variant="secondary">{cancelRequest.button}</SubmitButton>
        </div>
      </Form>
    </section>
  );
}

/** „Zrušení čeká na vedení“ with „Vzít žádost zpět“: what the author sees while the request waits. */
export function FutureCancelWaiting({
  id,
  version,
  retractCancelFuture,
  onRetracted,
}: {
  readonly id: string;
  readonly version: number;
  readonly retractCancelFuture: RetractCancelFutureAction;
  readonly onRetracted: () => void;
}) {
  const state = useActionForm({
    action: retractCancelFuture,
    toInput: () => ({ id, expectedVersion: version }),
    onSuccess: onRetracted,
  });
  return (
    <section aria-label={cancelRequest.waiting} className="space-y-3 border-t-2 border-ink pt-4">
      <p role="note" className="font-semibold">
        {cancelRequest.waiting}
      </p>
      <Form id={RETRACT_FORM_ID} spec={EMPTY_SPEC} state={refusalAsGone(state)}>
        <div>
          <SubmitButton variant="secondary">{cancelRequest.retract}</SubmitButton>
        </div>
      </Form>
    </section>
  );
}

/**
 * „Zamítnout zrušení“ (ADR 0062): the vedení keeps the item approved and tells its author why,
 * in a note that is required, like a return's.
 */
export function FutureCancelRefuse({
  id,
  version,
  refuseCancelFuture,
  onRefused,
}: {
  readonly id: string;
  readonly version: number;
  readonly refuseCancelFuture: RefuseCancelFutureAction;
  readonly onRefused: () => void;
}) {
  const [note, setNote] = useState('');
  const state = useActionForm({
    action: refuseCancelFuture,
    toInput: (data) => refuseCancelInput(id, version, data),
    onSuccess: () => {
      setNote('');
      onRefused();
    },
  });
  return (
    <section aria-label={cancelRequest.refuse} className="space-y-3 border-t-2 border-ink pt-4">
      <h2 className="font-semibold">{cancelRequest.refuse}</h2>
      <Form id={REFUSE_FORM_ID} spec={DECISION_SPEC} state={refusalAsGone(state)}>
        <NoteField
          note={note}
          setNote={setNote}
          phrases={[]}
          isDisabled={state.submitting !== null}
        />
        <div>
          <SubmitButton variant="secondary">{cancelRequest.refuse}</SubmitButton>
        </div>
      </Form>
    </section>
  );
}
