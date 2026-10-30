'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import type { FutureKind } from '@/domain/calendar';
import { future } from '@/ui/copy';
import {
  choiceOf,
  Form,
  RadioGroupField,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import type { CreateFutureAction } from './actions';

const FORM_ID = 'nova-akce';
const SPEC: FormSpec = {
  kind: {
    label: future.chooser.legend,
    required: true,
    messages: { required: future.chooser.required, invalid: future.chooser.invalid },
  },
};

/**
 * /akce/novy: what to start, a akce or a jednání (design section 12). The first press makes the
 * `clientRef` and the page keeps it, so a retry after a failure returns the draft the first press
 * made. The action does not refresh (ADR 0017): on success the route is replaced by the new draft.
 */
export function FutureChooser({
  kinds,
  createFuture,
}: {
  readonly kinds: readonly FutureKind[];
  readonly createFuture: CreateFutureAction;
}) {
  const router = useRouter();
  const clientRef = useRef<string | null>(null);
  const state = useActionForm({
    action: createFuture,
    toInput: (data) => {
      clientRef.current ??= crypto.randomUUID();
      return { clientRef: clientRef.current, kind: choiceOf(data, 'kind', kinds) };
    },
    onSuccess: ({ id }) => router.replace(`/akce/${id}`),
  });
  return (
    <>
      <SlantLabel level={1}>{future.new}</SlantLabel>
      <div className="mt-4">
        <Form id={FORM_ID} spec={SPEC} state={state}>
          <RadioGroupField
            name="kind"
            defaultValue={kinds[0]}
            options={kinds.map((kind) => ({ value: kind, label: future.kind[kind] }))}
          />
          <SubmitButton>{future.chooser.start}</SubmitButton>
        </Form>
      </div>
    </>
  );
}
