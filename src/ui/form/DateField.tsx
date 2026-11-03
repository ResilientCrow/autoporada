'use client';

import { useState } from 'react';

import { useFormContext } from './context';
import { dateEcho } from './dates';
import { fieldId } from './spec';
import { TextField } from './TextField';

/**
 * A native date control with the date in words under it (design section 6), for an autosaving
 * editor. It keeps what was typed, whether or not the server would take it yet: a year typed at
 * the keyboard passes through values such as `0020-01-14`, and a controlled control that went back
 * to the old date would undo every digit. The echo follows what is shown; the content follows
 * `onChange`.
 */
export function DateField({
  name,
  description,
  initial,
  onChange,
  issue,
  readOnly,
  onBlur,
}: {
  readonly name: string;
  readonly description?: string;
  readonly initial: string | null;
  readonly onChange: (value: string) => void;
  readonly issue: string | undefined;
  readonly readOnly: boolean;
  /** Leaving a field saves at once. */
  readonly onBlur: () => void;
}) {
  const { formId } = useFormContext();
  const [shown, setShown] = useState(initial ?? '');
  const echo = dateEcho(shown);
  const echoId = `${fieldId(formId, name)}-echo`;
  return (
    <TextField
      name={name}
      description={description}
      type="date"
      value={shown}
      onChange={(value) => {
        setShown(value);
        onChange(value);
      }}
      onBlur={onBlur}
      readOnly={readOnly}
      issue={issue}
      describedBy={echo === null ? undefined : echoId}
      after={echo === null ? null : <p id={echoId}>{echo}</p>}
    />
  );
}
