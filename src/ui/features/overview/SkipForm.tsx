'use client';

import type { z } from 'zod';

import type { ServerAction, setSkippedInput, setSkippedOutput } from '@/contracts';
import { issues } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm } from '@/ui/form';

import { formId, skipInput, skipSpec } from './inputs';

export type SkipAction = ServerAction<
  z.input<typeof setSkippedInput>,
  z.output<typeof setSkippedOutput>
>;

const COPY = { skip: issues.strip.skip, unskip: issues.strip.unskip } as const;

/**
 * The confirmed „Porada se nekoná“ or „Porada se koná“ of one Monday, a group
 * named by the heading `labelledBy` so each button is announced with its date.
 * A Monday whose deadline has passed fails on `monday`, which the summary links
 * to that heading; a `conflict` shows as a problem. On success the page
 * re-renders with the new status and version (the action refreshes it) and
 * `onDone` lets the host say what happened.
 */
export function SkipForm({
  action,
  monday,
  label,
  labelledBy,
  version,
  event,
  onDone,
}: {
  readonly action: SkipAction;
  readonly monday: string;
  /** The date as people read it. */
  readonly label: string;
  readonly labelledBy: string;
  readonly version: number | null;
  readonly event: 'skip' | 'unskip';
  readonly onDone: (event: 'skip' | 'unskip') => void;
}) {
  const state = useActionForm({
    action,
    toInput: (data) => skipInput(monday, event, version, data),
    onSuccess: () => onDone(event),
  });
  return (
    <section
      role="group"
      aria-labelledby={labelledBy}
      className="mt-3 space-y-3 border-t-2 border-ink pt-3"
    >
      <Form id={formId(monday)} spec={skipSpec(event, label)} state={state}>
        <CheckboxField name="confirmed" />
        <SubmitButton variant="secondary">{COPY[event].submit}</SubmitButton>
      </Form>
    </section>
  );
}
