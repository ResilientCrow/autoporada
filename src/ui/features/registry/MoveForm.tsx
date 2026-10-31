'use client';

import { registry } from '@/ui/copy';
import { Form, SubmitButton, useActionForm } from '@/ui/form';

import type { MoveListAction } from './actions';
import { moveListInput } from './inputs';

/** The ↑↓ pair of one list; the first cannot go up and the last cannot go down. */
export function MoveForm({
  action,
  id,
  title,
  first,
  last,
  onMoved,
}: {
  readonly action: MoveListAction;
  readonly id: string;
  readonly title: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly onMoved: () => void;
}) {
  const state = useActionForm({ action, toInput: moveListInput(id), onSuccess: onMoved });
  return (
    <Form id={`poradi-${id}`} spec={{}} state={state}>
      <div role="group" aria-label={registry.lists.move.label(title)} className="flex gap-3">
        <SubmitButton name="direction" value="up" variant="secondary" isDisabled={first}>
          {registry.lists.move.up}
        </SubmitButton>
        <SubmitButton name="direction" value="down" variant="secondary" isDisabled={last}>
          {registry.lists.move.down}
        </SubmitButton>
      </div>
    </Form>
  );
}
