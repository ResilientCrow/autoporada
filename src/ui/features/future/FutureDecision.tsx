'use client';

import { useEffect, useRef, useState } from 'react';

import type { ReviewDecision } from '@/domain/review';
import { future, review } from '@/ui/copy';
import { fieldId, Form, refusalAsGone, SubmitButton, useActionForm } from '@/ui/form';
import { Button } from '@/ui/kit';

import { FutureNote } from './FutureNote';
import {
  barChoices,
  decideInput,
  DECISION_FORM_ID,
  DECISION_SPEC,
  type DecideFutureAction,
  type FutureReviewModel,
  type Noted,
} from './review-calls';

const { decision } = review;

/**
 * The reviewer's bar at one version of the item (its host keys it by the version, so an open note
 * or a conflict notice never outlives the version it was about): the closed bar, or the note a
 * return or a reject asks for. Every decision sends the version the page showed; the action
 * refreshes the page, and the host says what happened. Opening the note moves focus into it;
 * „Zpět“ gives it back to the button that opened it.
 */
export function FutureDecision({
  id,
  version,
  bar,
  decideFuture,
  onDecided,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: FutureReviewModel;
  readonly decideFuture: DecideFutureAction;
  readonly onDecided: (event: ReviewDecision) => void;
}) {
  const [noted, setNoted] = useState<Noted | null>(null);
  const [note, setNote] = useState('');
  const pressed = useRef<ReviewDecision>('approve');
  const returnRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the bar has switched faces: into the note, or back to its opener. */
  const moveTo = useRef<'note' | Noted | null>(null);
  const state = useActionForm({
    action: decideFuture,
    toInput: (data) => {
      const input = decideInput(id, version, data);
      pressed.current = input.event;
      return input;
    },
    onSuccess: () => {
      setNoted(null);
      setNote('');
      onDecided(pressed.current);
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

  const choices = barChoices(bar);
  if (!choices.any) return null;
  const isDisabled = state.submitting !== null;
  return (
    <section aria-label={decision.label} className="space-y-3 border-t-2 border-ink py-3">
      <Form id={DECISION_FORM_ID} spec={DECISION_SPEC} state={refusalAsGone(state)}>
        {noted === null ? (
          <div className="flex flex-wrap items-center gap-3">
            {choices.ownItem ? <p className="w-full">{future.review.ownItem}</p> : null}
            {choices.approve ? (
              <SubmitButton name="decision" value="approve">
                {decision.approve}
              </SubmitButton>
            ) : null}
            {choices.return ? (
              <Button
                variant="secondary"
                ref={returnRef}
                isDisabled={isDisabled}
                onPress={() => open('return')}
              >
                {decision.return}
              </Button>
            ) : null}
            {choices.reject ? (
              <Button
                variant="secondary"
                ref={rejectRef}
                isDisabled={isDisabled}
                onPress={() => open('reject')}
              >
                {decision.reject}
              </Button>
            ) : null}
          </div>
        ) : (
          <FutureNote
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
