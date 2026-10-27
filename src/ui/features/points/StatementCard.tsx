'use client';

import { useState } from 'react';

import type { RecentPerson } from '@/domain/people';
import { POINT_LIMITS, type DraftPerson, type DraftStatement } from '@/domain/report';
import { points } from '@/ui/copy';
import { fieldId, PeopleField, SelectField, TextField, type Chip } from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

import type { PickerContext } from './BulletRow';
import { EDITOR_FORM_ID, statementField } from './editor-form';
import {
  genitiveNote,
  OTHER,
  pickSpeaker,
  selectedOption,
  setSpeaker,
  speakerOptions,
  unquotedStatement,
} from './statements-state';

const { statements: copy } = points;

/** The one chip of the „Jiná osoba…“ field: a card has one speaker, so one key serves. */
const SPEAKER_KEY = 'speaker';

/**
 * One statement (design section 7): a `<fieldset>` named „Vyjádření č. n“ with „Kdo“, the
 * speaker in the genitive, the function or class, the quote and the buttons that move or
 * remove it. „Jiná osoba…“ opens a one-slot people field. The note under the genitive
 * (choose a salutation, check the form) is worked out here at render and never stored. While the editor is locked the
 * fieldset is disabled, which takes every control in it out of reach at once.
 */
export function StatementCard({
  statement,
  index,
  participants,
  recents,
  issues,
  readOnly,
  picker,
  onEdit,
  onUp,
  onDown,
  onRemove,
  onBlur,
}: {
  readonly statement: DraftStatement;
  /** Where the card stands among the statements, from zero: it names the card's controls. */
  readonly index: number;
  readonly participants: readonly DraftPerson[];
  readonly recents: readonly RecentPerson[];
  /** The messages of the last refused save, by control name. */
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly picker: PickerContext;
  /** A change to this statement, worked out from the statement as it is when it is applied. */
  readonly onEdit: (change: (statement: DraftStatement) => DraftStatement) => void;
  readonly onUp: () => void;
  readonly onDown: () => void;
  readonly onRemove: () => void;
  /** Leaving a text field saves at once. */
  readonly onBlur: () => void;
}) {
  const n = index + 1;
  // „Jiná osoba…“ asked for while there is no speaker yet; it keeps the people field open.
  const [wantsOther, setWantsOther] = useState(false);
  const selected = selectedOption(statement, participants, wantsOther);
  const speakerName = statementField(index, 'speaker');
  const note = genitiveNote(statement, recents);
  const speaker = statement.speaker;
  const chips: readonly Chip[] = speaker === null ? [] : [{ key: SPEAKER_KEY, person: speaker }];

  const text = (apply: (value: string) => Partial<DraftStatement>) => (value: string) =>
    onEdit((previous) => ({ ...previous, ...apply(value) }));
  const leaveQuote = () => {
    // Hands the statement back as it is when the quote has no marks, so a plain blur is no change.
    onEdit(unquotedStatement);
    onBlur();
  };

  return (
    <fieldset
      disabled={readOnly}
      className="flex min-w-0 flex-col gap-3 rounded-brand border-2 border-ink p-3"
    >
      <legend className="px-1 font-bold">{copy.legend(n)}</legend>
      <SelectField
        name={speakerName}
        options={speakerOptions(participants, selected)}
        value={selected}
        issue={issues[speakerName]}
        onChange={(value) => {
          setWantsOther(value === OTHER);
          onEdit((previous) => pickSpeaker(previous, value, participants, recents));
        }}
      />
      {selected === OTHER ? (
        <PeopleField
          label={points.bullets.addPerson}
          listLabel={copy.otherList(n)}
          value={chips}
          onChange={(next) => {
            setWantsOther(true);
            onEdit((previous) => setSpeaker(previous, next[0]?.person ?? null, recents));
          }}
          limit={1}
          {...picker}
        />
      ) : null}
      <TextField
        name={statementField(index, 'speakerGenitive')}
        value={statement.speakerGenitive}
        maxLength={POINT_LIMITS.speakerGenitive}
        autoComplete="off"
        description={note ?? undefined}
        onChange={text((speakerGenitive) => ({ speakerGenitive }))}
        onBlur={onBlur}
        readOnly={readOnly}
        issue={issues[statementField(index, 'speakerGenitive')]}
      />
      <TextField
        name={statementField(index, 'affiliation')}
        value={statement.affiliation ?? ''}
        maxLength={POINT_LIMITS.statementAffiliation}
        autoComplete="off"
        onChange={text((affiliation) => ({ affiliation }))}
        onBlur={onBlur}
        readOnly={readOnly}
        issue={issues[statementField(index, 'affiliation')]}
      />
      <TextField
        name={statementField(index, 'quote')}
        multiline
        value={statement.quote}
        maxLength={POINT_LIMITS.quote}
        onChange={text((quote) => ({ quote }))}
        onBlur={leaveQuote}
        readOnly={readOnly}
        issue={issues[statementField(index, 'quote')]}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id={fieldId(EDITOR_FORM_ID, statementField(index, 'up'))}
          aria-label={copy.upLabel(n)}
          disabled={readOnly}
          onClick={onUp}
          className={buttonStyles('secondary')}
        >
          {copy.up}
        </button>
        <button
          type="button"
          id={fieldId(EDITOR_FORM_ID, statementField(index, 'down'))}
          aria-label={copy.downLabel(n)}
          disabled={readOnly}
          onClick={onDown}
          className={buttonStyles('secondary')}
        >
          {copy.down}
        </button>
        <button
          type="button"
          aria-label={copy.removeLabel(n)}
          disabled={readOnly}
          onClick={onRemove}
          className={buttonStyles('secondary')}
        >
          {copy.remove}
        </button>
      </div>
    </fieldset>
  );
}
