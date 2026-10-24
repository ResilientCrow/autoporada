'use client';

import type { z } from 'zod';

import type { decideAccessInput, decideAccessOutput, ServerAction } from '@/contracts';
import { users } from '@/ui/copy';
import { choiceOf, Form, SubmitButton, useActionForm } from '@/ui/form';

export type DecideAction = ServerAction<
  z.input<typeof decideAccessInput>,
  z.output<typeof decideAccessOutput>
>;
type Decided = z.output<typeof decideAccessOutput>['state'];

/** The decisions this form offers; blocking lives on the user's own page. */
const DECISIONS = [
  'approve-staff',
  'approve-student',
  'reject',
] as const satisfies readonly z.input<typeof decideAccessInput>['decision'][];

/** The buttons that answer one request: the ones its open decisions allow, nothing else. */
export function DecisionForm({
  action,
  requestId,
  version,
  events,
  onDecided,
}: {
  readonly action: DecideAction;
  readonly requestId: string;
  readonly version: number;
  readonly events: readonly string[];
  readonly onDecided: (state: Decided) => void;
}) {
  const state = useActionForm({
    action,
    toInput: (data) => ({ requestId, version, decision: choiceOf(data, 'decision', DECISIONS) }),
    onSuccess: (value) => onDecided(value.state),
  });
  if (!events.includes('approve') && !events.includes('reject')) return null;
  return (
    <Form id={`rozhodnuti-${requestId}`} spec={{}} state={state}>
      <div className="flex flex-wrap gap-2">
        {events.includes('approve') && (
          <>
            <SubmitButton name="decision" value="approve-staff">
              {users.queue.approveStaff}
            </SubmitButton>
            <SubmitButton name="decision" value="approve-student">
              {users.queue.approveStudent}
            </SubmitButton>
          </>
        )}
        {events.includes('reject') && (
          <SubmitButton name="decision" value="reject" variant="secondary">
            {users.queue.reject}
          </SubmitButton>
        )}
      </div>
      {events.includes('approve') && <p>{users.queue.studentHint}</p>}
    </Form>
  );
}
