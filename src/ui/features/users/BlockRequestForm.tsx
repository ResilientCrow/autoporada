'use client';

import { users } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import type { DecideAction } from './DecisionForm';
import { blockInput } from './inputs';

const SPEC: FormSpec = {
  confirmed: {
    label: users.detail.block.confirm,
    required: true,
    messages: { required: users.detail.block.unconfirmed },
  },
};

/** The separated, confirmed „Zablokovat další žádosti“; it cannot be undone. */
export function BlockRequestForm({
  action,
  requestId,
  version,
  onBlocked,
}: {
  readonly action: DecideAction;
  readonly requestId: string;
  readonly version: number;
  readonly onBlocked: () => void;
}) {
  const { block } = users.detail;
  const state = useActionForm({
    action,
    toInput: (data) => blockInput(requestId, version, data),
    onSuccess: onBlocked,
  });
  return (
    <section className="space-y-3 border-t-2 border-ink pt-4">
      <h3 className="text-lg font-bold">{block.title}</h3>
      <p>{block.text}</p>
      <Form id={`blokace-${requestId}`} spec={SPEC} state={state}>
        <CheckboxField name="confirmed" />
        <SubmitButton variant="secondary">{block.submit}</SubmitButton>
      </Form>
    </section>
  );
}
