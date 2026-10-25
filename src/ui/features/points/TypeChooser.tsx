'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import type { z } from 'zod';

import type { createPointInput, createPointOutput, ServerAction } from '@/contracts';
import { points } from '@/ui/copy';
import { Form, RadioGroupField, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import { keepRef, startInput } from './inputs';

const SPEC: FormSpec = {
  typeId: {
    label: points.chooser.legend,
    required: true,
    messages: { required: points.chooser.required, invalid: points.chooser.invalid },
  },
};

export type CreatePointAction = ServerAction<
  z.input<typeof createPointInput>,
  z.output<typeof createPointOutput>
>;

/**
 * /body/novy: the heading and the type to start a report on. The first press makes the
 * `clientRef` and the page keeps it, so a retry after a failure returns the
 * same draft (design section 6). The action does not refresh (ADR 0017): on
 * success the route is replaced by the new draft.
 */
export function TypeChooser({
  types,
  createPoint,
}: {
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly createPoint: CreatePointAction;
}) {
  const router = useRouter();
  const clientRef = useRef<string | null>(null);
  const state = useActionForm({
    action: createPoint,
    toInput: (data) =>
      startInput(
        data,
        keepRef(clientRef, () => crypto.randomUUID()),
      ),
    onSuccess: ({ id }) => router.replace(`/body/${id}`),
  });
  return (
    <>
      <SlantLabel level={1}>{points.title.new}</SlantLabel>
      <div className="mt-4">
        <Form id="novy-bod" spec={SPEC} state={state}>
          <RadioGroupField
            name="typeId"
            options={types.map((type) => ({ value: type.id, label: type.name }))}
          />
          <SubmitButton>{points.chooser.start}</SubmitButton>
        </Form>
      </div>
    </>
  );
}
