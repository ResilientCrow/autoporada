'use client';

import { useState } from 'react';

import { POINT_LIMITS } from '@/domain/report';
import { points } from '@/ui/copy';
import { RadioGroupField, TextField } from '@/ui/form';

import { DateEcho } from './DateEcho';
import { EDITOR_FORM_ID } from './editor-form';
import { bodyFromText, CAMPUSES, dateEcho, type PointContentWire } from './fields';
import { patchFor, type Patch, type PatchName } from './report-patch';

type Issues = Readonly<Record<string, string>>;

interface FieldProps {
  readonly readOnly: boolean;
  /** Leaving a field saves at once. */
  readonly onBlur: () => void;
}

/**
 * Caps the characters a person can type into the body. It does not promise the body
 * fits: a character is up to three bytes, each line adds JSON around it, and the
 * contract caps the paragraphs too. A save the contract refuses puts its message under
 * the field (`issue`), which covers the rest.
 */
const BODY_CHARS = Math.floor(POINT_LIMITS.bodyBytes / 4);

const CAMPUS_OPTIONS = CAMPUSES.map((campus) => ({ value: campus, label: points.campus[campus] }));

/**
 * A date control keeps what was typed, whether or not the server would take it yet: a
 * year typed at the keyboard passes through values such as `0020-01-14`, and a controlled
 * control that went back to the old date would undo every digit. The echo follows what is
 * shown; the content follows `onChange`.
 */
function DateField({
  name,
  initial,
  onChange,
  issue,
  readOnly,
  onBlur,
}: FieldProps & {
  readonly name: 'eventDate' | 'endDate';
  readonly initial: string | null;
  readonly onChange: (value: string) => void;
  readonly issue: string | undefined;
}) {
  const [shown, setShown] = useState(initial ?? '');
  const echoId = `${EDITOR_FORM_ID}-${name}-echo`;
  return (
    <TextField
      name={name}
      type="date"
      value={shown}
      onChange={(value) => {
        setShown(value);
        onChange(value);
      }}
      onBlur={onBlur}
      readOnly={readOnly}
      issue={issue}
      describedBy={dateEcho(shown) === null ? undefined : echoId}
      after={<DateEcho id={echoId} value={shown} />}
    />
  );
}

/**
 * Typ aside, the report's first fields (design section 6, fields 2 to 6): title, the
 * dates and times as native controls with their ISO value, campus and place. Each
 * change hands the editor a patch (`patchFor`); `issues` holds the messages of the last
 * save the contract refused, by field name.
 */
export function ReportFields({
  content,
  issues,
  readOnly,
  onChange,
  onBlur,
}: FieldProps & {
  readonly content: PointContentWire;
  readonly issues: Issues;
  readonly onChange: (patch: Patch) => void;
}) {
  /** A field's name with the change that belongs to it, so the two cannot drift apart. */
  const bound = <N extends PatchName>(name: N) => ({
    name,
    onChange: (value: string) => onChange(patchFor(name, value, content)),
    issue: issues[name],
    readOnly,
    onBlur,
  });
  return (
    <>
      <TextField
        {...bound('title')}
        value={content.title}
        maxLength={POINT_LIMITS.title}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField {...bound('eventDate')} initial={content.eventDate} />
        <DateField {...bound('endDate')} initial={content.endDate} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...bound('timeFrom')} type="time" value={content.timeFrom ?? ''} />
        <TextField {...bound('timeTo')} type="time" value={content.timeTo ?? ''} />
      </div>
      <RadioGroupField
        name="campus"
        options={CAMPUS_OPTIONS}
        value={content.campus ?? ''}
        onChange={bound('campus').onChange}
        readOnly={readOnly}
      />
      <TextField
        {...bound('place')}
        description={points.editor.placeHint}
        maxLength={POINT_LIMITS.place}
        value={content.place ?? ''}
        autoComplete="off"
      />
    </>
  );
}

/**
 * „Další odstavce“: a plain textarea. It keeps the text as typed (the stored body
 * is trimmed line by line, which would eat a space typed at the end of a line) and
 * hands the editor the body made from it.
 */
export function BodyField({
  text,
  issue,
  readOnly,
  onChange,
  onBlur,
}: FieldProps & {
  readonly text: string;
  readonly issue?: string;
  readonly onChange: (text: string, body: PointContentWire['body']) => void;
}) {
  return (
    <TextField
      name="body"
      multiline
      value={text}
      maxLength={BODY_CHARS}
      onChange={(value) => onChange(value, bodyFromText(value))}
      readOnly={readOnly}
      onBlur={onBlur}
      issue={issue}
    />
  );
}
