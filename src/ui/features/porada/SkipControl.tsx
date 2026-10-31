'use client';

import { useState } from 'react';
import type { z } from 'zod';

import type { ServerAction, setSkippedInput, setSkippedOutput } from '@/contracts';
import { issues, porada } from '@/ui/copy';
import { CheckboxField, Form, LiveStatus, SubmitButton, useActionForm } from '@/ui/form';
import { Card } from '@/ui/kit';

import { skipFormId, skipInput, skipSpec } from './skip';

export type SkipAction = ServerAction<
  z.input<typeof setSkippedInput>,
  z.output<typeof setSkippedOutput>
>;

/** What the control needs of the slot; the dates arrive written, „10. 11. 2026“. */
export interface SkipView {
  readonly monday: string;
  /** The meeting date, for the button's context. */
  readonly label: string;
  readonly status: 'open' | 'skipped';
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  readonly deadlinePassed: boolean;
  /** Where the approved points go without this porada; null when no slot follows. */
  readonly next: string | null;
}

const EVENT = { open: 'skip', skipped: 'unskip' } as const;

function SkipForm({
  action,
  view,
  onDone,
}: {
  readonly action: SkipAction;
  readonly view: SkipView;
  readonly onDone: (event: 'skip' | 'unskip') => void;
}) {
  const event = EVENT[view.status];
  const state = useActionForm({
    action,
    toInput: (data) => skipInput(view.monday, event, view.version, data),
    onSuccess: () => onDone(event),
  });
  const COPY = event === 'skip' ? issues.strip.skip : issues.strip.unskip;
  return (
    <Form id={skipFormId(view.monday)} spec={skipSpec(event, view.label)} state={state}>
      <CheckboxField name="confirmed" />
      <SubmitButton variant="secondary">{COPY.submit}</SubmitButton>
    </Form>
  );
}

/**
 * „Porada se nekoná“ or „Porada se koná“ with the confirmation, for a slot that is not generated.
 * After the deadline it warns where the approved points go instead (D2); an unskip says that
 * points handed in meanwhile stay where they are (R21). The form starts again when the status or
 * version the page brings changes; the status line outlives it.
 */
export function SkipControl({
  action,
  view,
}: {
  readonly action: SkipAction;
  readonly view: SkipView;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const done = (event: 'skip' | 'unskip') =>
    setSaid((s) => ({ message: issues.strip.said[event](view.label), count: s.count + 1 }));
  const note =
    view.status === 'skipped'
      ? view.next !== null && porada.skip.kept(view.next)
      : view.deadlinePassed &&
        (view.next === null ? porada.skip.noNext : porada.skip.afterDeadline(view.next));
  return (
    <Card level={2} title={porada.skip.title}>
      <div className="space-y-3">
        {note !== false && note !== null && <p>{note}</p>}
        <SkipForm
          key={`${view.status}-${view.version}`}
          action={action}
          view={view}
          onDone={done}
        />
        <LiveStatus message={said.message} count={said.count} />
      </div>
    </Card>
  );
}
