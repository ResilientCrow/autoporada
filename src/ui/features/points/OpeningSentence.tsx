'use client';

import { useEffect, useRef, type Ref } from 'react';

import { POINT_LIMITS } from '@/domain/report';
import { points } from '@/ui/copy';
import { fieldId, TextField } from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

import { EDITOR_FORM_ID } from './editor-form';
import { noticeMode, type NoticeMode } from './opening-state';

const { opening: copy } = points;

/**
 * The notice under the box and, once „Vytvořit znovu“ is pressed, the question that takes
 * its place. Plain text with buttons: it is not urgent, so it is no alert, and the
 * author's own sentence stays as it is until they answer.
 */
export function OpeningNotice({
  mode,
  id,
  readOnly,
  yes,
  onAsk,
  onReplace,
  onKeep,
}: {
  readonly mode: NoticeMode;
  /** The id of the text, which the box is described by while it shows. */
  readonly id: string;
  readonly readOnly: boolean;
  /** The „Ano, nahradit“ button, which takes focus when the question appears. */
  readonly yes?: Ref<HTMLButtonElement>;
  readonly onAsk: () => void;
  readonly onReplace: () => void;
  readonly onKeep: () => void;
}) {
  if (mode === 'none') return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === 'question' ? (
        <>
          <p id={id}>{copy.confirm}</p>
          <button
            type="button"
            ref={yes}
            disabled={readOnly}
            onClick={onReplace}
            className={buttonStyles('secondary')}
          >
            {copy.replace}
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={onKeep}
            className={buttonStyles('secondary')}
          >
            {copy.keep}
          </button>
        </>
      ) : (
        <>
          <p id={id}>{copy.changed}</p>
          <button
            type="button"
            disabled={readOnly}
            onClick={onAsk}
            className={buttonStyles('secondary')}
          >
            {copy.recreate}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * „Úvodní věta“ (design section 6): a textarea holding the sentence the fields make until
 * the author types in it, the notice that the fields have changed since, and the inline
 * question before the sentence is replaced. It holds no content: the editor decides what
 * a keystroke or an answer does (`opening-state`), `stale` says whether the notice is due,
 * `asking` whether the question is open, and `onAsk`, `onReplace` and `onKeep` are the
 * three presses. While the notice or the question shows, the box is described by its text.
 */
export function OpeningSentence({
  text,
  stale,
  asking,
  issue,
  readOnly,
  onType,
  onAsk,
  onReplace,
  onKeep,
  onBlur,
}: {
  readonly text: string;
  /** The author's sentence is no longer the one the fields would make. */
  readonly stale: boolean;
  /** The question „Nahradit vaši větu novou?“ is open. */
  readonly asking: boolean;
  /** What a refused save said about the sentence. */
  readonly issue?: string;
  readonly readOnly: boolean;
  readonly onType: (text: string) => void;
  /** „Vytvořit znovu“. */
  readonly onAsk: () => void;
  /** „Ano, nahradit“. */
  readonly onReplace: () => void;
  /** „Ponechat“. */
  readonly onKeep: () => void;
  readonly onBlur: () => void;
}) {
  const yes = useRef<HTMLButtonElement>(null);
  const boxId = fieldId(EDITOR_FORM_ID, 'opening');
  const noticeId = `${boxId}-notice`;
  const mode = noticeMode(stale, asking);

  // The question's buttons appear with it, so focus follows them there.
  useEffect(() => {
    if (asking) yes.current?.focus();
  }, [asking]);

  // Both answers remove the buttons, which would drop focus to the page: it goes to the box.
  const answer = (done: () => void) => () => {
    done();
    document.getElementById(boxId)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <TextField
        name="opening"
        multiline
        value={text}
        maxLength={POINT_LIMITS.opening}
        onChange={onType}
        onBlur={onBlur}
        readOnly={readOnly}
        issue={issue}
        describedBy={mode === 'none' ? undefined : noticeId}
      />
      <OpeningNotice
        mode={mode}
        id={noticeId}
        readOnly={readOnly}
        yes={yes}
        onAsk={onAsk}
        onReplace={answer(onReplace)}
        onKeep={answer(onKeep)}
      />
    </div>
  );
}
