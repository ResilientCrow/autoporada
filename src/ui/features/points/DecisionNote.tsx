'use client';

import { review } from '@/ui/copy';
import { NoteField, SubmitButton } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { Noted } from './decision';

const { decision } = review;

/** The note a return or a reject asks for, its counter and the quick phrases that write into it. */
export function DecisionNote({
  noted,
  note,
  setNote,
  onBack,
  isDisabled,
}: {
  readonly noted: Noted;
  readonly note: string;
  readonly setNote: (update: (note: string) => string) => void;
  readonly onBack: () => void;
  /** A decision is in flight: the phrases and „Zpět“ wait beside the pending send. */
  readonly isDisabled: boolean;
}) {
  return (
    <>
      <NoteField note={note} setNote={setNote} phrases={decision.phrases} isDisabled={isDisabled} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="decision" value={noted}>
          {noted === 'return' ? decision.return : decision.reject}
        </SubmitButton>
        <Button variant="secondary" isDisabled={isDisabled} onPress={onBack}>
          {decision.back}
        </Button>
      </div>
    </>
  );
}
