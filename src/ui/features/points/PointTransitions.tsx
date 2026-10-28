'use client';

import { points } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import {
  retractInput,
  throughFlush,
  withdrawInput,
  quietedBy,
  type Around,
  type PointMoves,
} from './transition-call';

const { retract, withdraw } = points.transitions;
const RETRACT_FORM_ID = 'bod-stahnout';
const WITHDRAW_FORM_ID = 'bod-zrusit';
const RETRACT_HINT_ID = `${RETRACT_FORM_ID}-napoveda`;
const RETRACT_SPEC: FormSpec = {};
const WITHDRAW_SPEC: FormSpec = {
  confirmed: {
    label: withdraw.confirm,
    required: true,
    messages: { required: withdraw.unconfirmed },
  },
};

/**
 * The author's other moves on a point (design section 9): „Stáhnout“ for a submitted point and
 * „Zrušit bod“ with its required box, each its own form (a native form cannot nest in the editor's).
 * `moves.events` is what the server said the author may do from this state, so no button shows
 * that the server would refuse. Each sends the `version` the page showed; in the editor `around`
 * is the autosave's after-the-flush primitive, which waits for what was typed and sends the
 * version it landed on, and `held` disables the buttons while a banner or a send holds the editor.
 * The banners own the answers about a moved or missing point and a lost session, so there the forms
 * show none of them (`quietedBy`); a read view has no banner and shows every problem.
 */
export function PointTransitions({
  id,
  version,
  moves,
  around,
  held = false,
}: {
  readonly id: string;
  readonly version: number;
  readonly moves: PointMoves;
  readonly around?: Around;
  readonly held?: boolean;
}) {
  const { events, retractPoint, withdrawPoint } = moves;
  const retracting = useActionForm({
    action: throughFlush(retractPoint, around),
    toInput: () => retractInput(id, version),
  });
  const withdrawing = useActionForm({
    action: throughFlush(withdrawPoint, around),
    toInput: (data) => withdrawInput(id, version, data),
  });
  if (events.length === 0) return null;
  return (
    <div className="space-y-6">
      {events.includes('retract') ? (
        <Form id={RETRACT_FORM_ID} spec={RETRACT_SPEC} state={quietedBy(around, retracting)}>
          <p id={RETRACT_HINT_ID}>{retract.hint}</p>
          <div>
            <SubmitButton variant="secondary" isDisabled={held} describedBy={RETRACT_HINT_ID}>
              {retract.button}
            </SubmitButton>
          </div>
        </Form>
      ) : null}
      {events.includes('withdraw') ? (
        <Form id={WITHDRAW_FORM_ID} spec={WITHDRAW_SPEC} state={quietedBy(around, withdrawing)}>
          <CheckboxField name="confirmed" />
          <div>
            <SubmitButton variant="secondary" isDisabled={held}>
              {withdraw.button}
            </SubmitButton>
          </div>
        </Form>
      ) : null}
    </div>
  );
}
