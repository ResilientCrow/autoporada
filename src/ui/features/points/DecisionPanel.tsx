'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ReviewDecision } from '@/domain/review';
import { review } from '@/ui/copy';
import { choiceOf, fieldId, Form, refusalAsGone, useActionForm } from '@/ui/form';

import {
  afterDecision,
  barChoices,
  barClass,
  decidedEvent,
  decideInput,
  DECISION_FORM_ID,
  DECISION_SPEC,
  PRESSES,
  type DecidePointAction,
  type DecisionBarModel,
  type Noted,
  type Press,
} from './decision';
import { DecisionChoices } from './DecisionChoices';
import { DecisionNote } from './DecisionNote';

/**
 * The decision bar's form at one version of the point (its host keys it by the version, ADR 0013
 * item 1): the closed bar or the note a return or a reject asks for. Every decision sends the
 * version the page showed; the action refreshes the page, the host says what happened and moves
 * focus, and „Schválit a pokračovat“ then opens the point the answer names as next (ADR 0025).
 * The form's one problem notice carries every failure: a conflict with its reload, a refusal as
 * the point being gone. Opening the note moves focus into it; „Zpět“ gives it back to the button
 * that opened it.
 */
export function DecisionPanel({
  id,
  version,
  bar,
  decidePoint,
  onDecided,
  canEdit = false,
  onEdit,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: DecisionBarModel;
  readonly decidePoint: DecidePointAction;
  readonly onDecided: (event: ReviewDecision) => void;
  /** The page gives the reviewer's editor: the bar offers „Upravit“. */
  readonly canEdit?: boolean;
  readonly onEdit?: () => void;
}) {
  const router = useRouter();
  const [noted, setNoted] = useState<Noted | null>(null);
  const [note, setNote] = useState('');
  const pressed = useRef<Press>('approve');
  const returnRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the bar has switched faces: into the note, or back to its opener. */
  const moveTo = useRef<'note' | Noted | null>(null);
  const state = useActionForm({
    action: decidePoint,
    toInput: (data) => {
      pressed.current = choiceOf(data, 'decision', PRESSES);
      return decideInput(id, version, data);
    },
    onSuccess: ({ next }) => {
      setNoted(null);
      setNote('');
      onDecided(decidedEvent(pressed.current));
      const to = afterDecision(pressed.current, next);
      if (to !== null) router.push(to);
    },
  });
  useEffect(() => {
    const target = moveTo.current;
    moveTo.current = null;
    if (target === 'note') document.getElementById(fieldId(DECISION_FORM_ID, 'note'))?.focus();
    else if (target !== null) (target === 'return' ? returnRef : rejectRef).current?.focus();
  }, [noted]);
  const open = (event: Noted) => {
    moveTo.current = 'note';
    setNoted(event);
  };
  const back = () => {
    moveTo.current = noted;
    setNoted(null);
  };

  const choices = barChoices(bar, canEdit);
  if (!choices.any) return null;
  const isDisabled = state.submitting !== null;
  return (
    <section aria-label={review.decision.label} className={barClass(noted)}>
      <Form id={DECISION_FORM_ID} spec={DECISION_SPEC} state={refusalAsGone(state)}>
        {noted === null ? (
          <DecisionChoices
            choices={choices}
            isDisabled={isDisabled}
            onOpen={open}
            onEdit={onEdit}
            returnRef={returnRef}
            rejectRef={rejectRef}
          />
        ) : (
          <DecisionNote
            noted={noted}
            note={note}
            setNote={setNote}
            onBack={back}
            isDisabled={isDisabled}
          />
        )}
      </Form>
    </section>
  );
}
