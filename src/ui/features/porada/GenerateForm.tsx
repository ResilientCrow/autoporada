'use client';

import type { z } from 'zod';

import type { generateIssueInput, generateIssueOutput, ServerAction } from '@/contracts';
import { porada } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm } from '@/ui/form';
import { Card } from '@/ui/kit';

import { generateInput, generateSpec } from './generate';

export type GenerateAction = ServerAction<
  z.input<typeof generateIssueInput>,
  z.output<typeof generateIssueOutput>
>;

/** What the form needs of an open porada the headmaster previews. */
export interface GenerateView {
  readonly monday: string;
  /** The version the preview was read at; null for a Monday without a row yet. */
  readonly version: number | null;
  /** A finding blocks it: the button stays off until the data is fixed. */
  readonly blocked: boolean;
}

/**
 * „Vygenerovat dokument“ on the preview (ADR 0038): the confirmation and the button. The page
 * refreshes on success and then shows the generated document instead of this form.
 */
export function GenerateForm({
  action,
  view,
}: {
  readonly action: GenerateAction;
  readonly view: GenerateView;
}) {
  const state = useActionForm({
    action,
    toInput: (data) => generateInput(view.monday, view.version, data),
  });
  return (
    <Card level={2} title={porada.generate.title}>
      <div className="space-y-3">
        <p id="generovani-pozn">{view.blocked ? porada.generate.blocked : porada.generate.intro}</p>
        <Form id={`porada-generate-${view.monday}`} spec={generateSpec} state={state}>
          <CheckboxField name="confirmed" disabled={view.blocked} />
          <SubmitButton isDisabled={view.blocked} describedBy="generovani-pozn">
            {porada.generate.submit}
          </SubmitButton>
        </Form>
      </div>
    </Card>
  );
}
