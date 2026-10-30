'use client';

import { useId } from 'react';

import { review } from '@/ui/copy';
import { Button } from '@/ui/kit';

import { noteLength, withPhrase } from './note';
import { TextField } from './TextField';

/**
 * The note a return or a reject asks for (field `note` of the form's spec): the text, its counter
 * and the quick phrases that write into it. The page's `phrases` are its own; the counter and the
 * group's label are the same wherever the note is asked for.
 */
export function NoteField({
  note,
  setNote,
  phrases,
  isDisabled,
}: {
  readonly note: string;
  readonly setNote: (update: (note: string) => string) => void;
  readonly phrases: readonly string[];
  /** A decision is in flight: the phrases wait beside the pending send. */
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
        after={<p id={countId}>{review.decision.count(noteLength(note))}</p>}
      />
      <div role="group" aria-label={review.decision.phrasesLabel} className="flex flex-wrap gap-2">
        {phrases.map((phrase) => (
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
    </>
  );
}
