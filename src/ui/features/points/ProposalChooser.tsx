'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import type { ProposalKind } from '@/domain/report';
import { points } from '@/ui/copy';
import { Form, RadioGroupField, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import { keepRef, proposalInput } from './inputs';
import type { CreatePointAction } from './TypeChooser';

const SPEC: FormSpec = { kind: { label: points.proposal.legend, required: true } };

/**
 * /navrhy/novy: the heading and the kind of proposal to start, finance or pokyn. Like the type
 * chooser it keeps the first press's `clientRef`, so a retry returns the same draft, and on
 * success replaces the route with the new draft, where its title and text are written. The first
 * kind is checked, since the draft cannot change its kind afterwards and a press must name one.
 */
export function ProposalChooser({
  kinds,
  createPoint,
}: {
  readonly kinds: readonly ProposalKind[];
  readonly createPoint: CreatePointAction;
}) {
  const router = useRouter();
  const clientRef = useRef<string | null>(null);
  const state = useActionForm({
    action: createPoint,
    toInput: (data) =>
      proposalInput(
        data,
        keepRef(clientRef, () => crypto.randomUUID()),
      ),
    onSuccess: ({ id }) => router.replace(`/body/${id}`),
  });
  return (
    <>
      <SlantLabel level={1}>{points.proposal.title}</SlantLabel>
      <div className="mt-4">
        <Form id="novy-navrh" spec={SPEC} state={state}>
          <RadioGroupField
            name="kind"
            defaultValue={kinds[0]}
            options={kinds.map((kind) => ({ value: kind, label: points.proposal.kind[kind] }))}
          />
          <SubmitButton>{points.chooser.start}</SubmitButton>
        </Form>
      </div>
    </>
  );
}
