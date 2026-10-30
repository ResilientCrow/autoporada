'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import type { z } from 'zod';

import type { createPointInput, createPointOutput, ServerAction } from '@/contracts';
import { Form, RadioGroupField, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';
import { points } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';

import { keepRef } from './inputs';

export type CreatePointAction = ServerAction<
  z.input<typeof createPointInput>,
  z.output<typeof createPointOutput>
>;

/**
 * The start flow both choosers share: a heading and one radio group in a form of its own. The
 * first press makes the `clientRef` and the page keeps it, so a retry after a failure returns the
 * same draft (design section 6). The action does not refresh (ADR 0017): on success the route is
 * replaced by the new draft. The caller says what is chosen (`field`, `options`) and how the
 * choice becomes the action's input.
 */
export function StartChooser({
  heading,
  formId,
  spec,
  field,
  options,
  defaultValue,
  toInput,
  createPoint,
}: {
  readonly heading: string;
  readonly formId: string;
  readonly spec: FormSpec;
  /** The radio group's name, and the form field `toInput` reads. */
  readonly field: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** The value checked to begin with; none checks nothing. */
  readonly defaultValue?: string;
  readonly toInput: (data: FormData, clientRef: string) => z.input<typeof createPointInput>;
  readonly createPoint: CreatePointAction;
}) {
  const router = useRouter();
  const clientRef = useRef<string | null>(null);
  const state = useActionForm({
    action: createPoint,
    toInput: (data) =>
      toInput(
        data,
        keepRef(clientRef, () => crypto.randomUUID()),
      ),
    onSuccess: ({ id }) => router.replace(`/body/${id}`),
  });
  return (
    <>
      <SlantLabel level={1}>{heading}</SlantLabel>
      <div className="mt-4">
        <Form id={formId} spec={spec} state={state}>
          <RadioGroupField
            name={field}
            {...(defaultValue !== undefined && { defaultValue })}
            options={options}
          />
          <SubmitButton>{points.chooser.start}</SubmitButton>
        </Form>
      </div>
    </>
  );
}
