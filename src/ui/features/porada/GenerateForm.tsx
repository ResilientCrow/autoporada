'use client';

import { useRef, useState } from 'react';
import type { z } from 'zod';

import type { generateIssueInput, generateIssueOutput, ServerAction } from '@/contracts';
import { porada } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm } from '@/ui/form';
import { Button, ButtonLink, Card, Cluster, Dialog } from '@/ui/kit';

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
  /** Placeholders for missing reports the headmaster has not checked (ADR 0061): generating asks first. */
  readonly unchecked: number;
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
  const [asking, setAsking] = useState(false);
  const formId = `porada-generate-${view.monday}`;
  const real = useRef<HTMLDivElement>(null);
  const ask = view.unchecked > 0 && !view.blocked;
  return (
    <Card level={2} title={porada.generate.title}>
      <div className="space-y-3">
        <p id="generovani-pozn">{view.blocked ? porada.generate.blocked : porada.generate.intro}</p>
        <Form id={formId} spec={generateSpec} state={state}>
          <CheckboxField name="confirmed" disabled={view.blocked} />
          {ask ? (
            <>
              <Dialog
                title={porada.generate.unchecked.title}
                isOpen={asking}
                onOpenChange={setAsking}
                trigger={
                  <Button
                    describedBy="generovani-pozn"
                    isPending={state.submitting !== null}
                    isDisabled={state.submitting !== null}
                  >
                    {porada.generate.submit}
                  </Button>
                }
              >
                <p>{porada.generate.unchecked.confirm(view.unchecked)}</p>
                <Cluster>
                  <ButtonLink href={`/porada/${view.monday}/zpravy`}>
                    {porada.generate.unchecked.goCheck}
                  </ButtonLink>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setAsking(false);
                      // Through the real submit button, so the form knows who sent it.
                      const submitter = real.current?.querySelector('button');
                      submitter?.form?.requestSubmit(submitter);
                    }}
                  >
                    {porada.generate.unchecked.anyway}
                  </Button>
                </Cluster>
              </Dialog>
              <div hidden ref={real}>
                <SubmitButton>{porada.generate.submit}</SubmitButton>
              </div>
            </>
          ) : (
            <SubmitButton isDisabled={view.blocked} describedBy="generovani-pozn">
              {porada.generate.submit}
            </SubmitButton>
          )}
        </Form>
      </div>
    </Card>
  );
}
