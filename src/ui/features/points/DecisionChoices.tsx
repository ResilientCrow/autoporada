'use client';

import type { Ref } from 'react';

import { review } from '@/ui/copy';
import { SubmitButton } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { barChoices, Noted } from './decision';

const { decision } = review;

/**
 * The closed bar: the approvals as submit buttons, „Vrátit k úpravě“ and „Zamítnout“ opening the
 * note, and on a reviewer's own point the sentence saying who approves it, beside the buttons. One
 * row from md on, so the sticky bar fits the room `bar-room` keeps clear.
 */
export function DecisionChoices({
  choices,
  isDisabled,
  onOpen,
  returnRef,
  rejectRef,
}: {
  readonly choices: ReturnType<typeof barChoices>;
  /** A decision is in flight: the buttons that open the note wait too. */
  readonly isDisabled: boolean;
  readonly onOpen: (event: Noted) => void;
  /** Where focus goes back to when „Zpět“ closes the note each opened. */
  readonly returnRef: Ref<HTMLButtonElement>;
  readonly rejectRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
      {choices.ownPoint ? <p className="w-full md:w-auto md:flex-1">{decision.ownPoint}</p> : null}
      {choices.approve ? (
        <>
          <SubmitButton name="decision" value="approve">
            {decision.approve}
          </SubmitButton>
          <SubmitButton name="decision" value="approve-next" variant="secondary">
            {decision.approveNext}
          </SubmitButton>
        </>
      ) : null}
      {choices.return ? (
        <Button
          variant="secondary"
          ref={returnRef}
          isDisabled={isDisabled}
          onPress={() => onOpen('return')}
        >
          {decision.return}
        </Button>
      ) : null}
      {choices.reject ? (
        <Button
          variant="secondary"
          ref={rejectRef}
          isDisabled={isDisabled}
          onPress={() => onOpen('reject')}
        >
          {decision.reject}
        </Button>
      ) : null}
    </div>
  );
}
