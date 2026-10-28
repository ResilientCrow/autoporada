'use client';

import { useId } from 'react';

import { review } from '@/ui/copy';
import { SubmitButton, TextField } from '@/ui/form';
import { Button } from '@/ui/kit';

import { noteLength, withPhrase, type Noted } from './decision';

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
  const countId = useId();
  return (
    <>
      <TextField
        name="note"
        multiline
        value={note}
        onChange={(text) => setNote(() => text)}
        describedBy={countId}
        after={<p id={countId}>{decision.count(noteLength(note))}</p>}
      />
      <div role="group" aria-label={decision.phrasesLabel} className="flex flex-wrap gap-2">
        {decision.phrases.map((phrase) => (
          <Button
            key={phrase}
            variant="secondary"
            isDisabled={isDisabled}
            onPress={() => setNote((text) => withPhrase(text, phrase))}
          >
            {phrase}
          </Button>
        ))}
      </div>
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
