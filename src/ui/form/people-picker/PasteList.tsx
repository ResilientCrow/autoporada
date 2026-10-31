'use client';

import { useId, useState } from 'react';

import { parsePeopleList } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import { people } from '@/ui/copy';
import { buttonStyles, Disclosure } from '@/ui/kit';

import { CONTROL } from '../control-styles';

import { PastePreview } from './PastePreview';
import {
  afterAdd,
  checkedMessage,
  chosen,
  knownNames,
  PASTE_INPUT_CEILING,
  previewOf,
  type Chosen,
  type Preview,
} from './paste-state';

const { paste } = people;

/**
 * „Vložit seznam“ (design section 5): a textarea, „Zkontrolovat“, and the
 * preview. It reads the text in the browser (the recents tell it which names
 * it knows) and calls nothing. It has no live region and adds nobody itself:
 * `onChecked` is given what to say after „Zkontrolovat“, `onAdd` takes the
 * checked people and returns how many the field took, and the field says it
 * all. The added rows leave the preview and the text; the ones that did not
 * fit stay in both, so a second check does not bring the added people back.
 */
export function PasteList({
  recents,
  onAdd,
  onChecked,
}: {
  readonly recents: readonly RecentPerson[];
  readonly onAdd: (people: readonly Chosen[]) => number;
  readonly onChecked: (message: string) => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const id = useId();
  const hintId = `${id}-hint`;

  function check() {
    const read = previewOf(parsePeopleList(text, knownNames(recents)));
    setPreview(read);
    onChecked(checkedMessage(read));
  }

  function add() {
    if (preview === null) return;
    const left = afterAdd(preview, onAdd(chosen(preview)));
    setPreview(left.preview);
    setText(left.text);
  }

  return (
    <Disclosure summary={paste.summary}>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-bold">
          {paste.label}
        </label>
        <span id={hintId}>{paste.hint}</span>
        <textarea
          id={id}
          rows={6}
          maxLength={PASTE_INPUT_CEILING}
          value={text}
          aria-describedby={hintId}
          onChange={(event) => setText(event.target.value)}
          className={CONTROL}
        />
      </div>
      <div>
        <button type="button" onClick={check} className={buttonStyles('secondary')}>
          {paste.check}
        </button>
      </div>
      {preview === null ? null : (
        <PastePreview preview={preview} onPreview={setPreview} onAdd={add} />
      )}
    </Disclosure>
  );
}
