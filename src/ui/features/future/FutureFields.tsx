'use client';

import { ORGANIZER_ROLES, organizerOnOneLine } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import { future, points } from '@/ui/copy';
import { DateField, RadioGroupField, TextField } from '@/ui/form';

import { CAMPUSES, isMultiDay, type FutureEdit, type PatchName } from './edit';

const ROLE_OPTIONS = ORGANIZER_ROLES.map((role) => ({
  value: role,
  label: future.editor.organizerRole[role],
}));
const CAMPUS_OPTIONS = CAMPUSES.map((campus) => ({ value: campus, label: points.campus[campus] }));

/**
 * The fields of an item in page order (design section 12): title, the dates and times as native
 * controls with their ISO value (the times only for a single day), campus, place and the three
 * free texts: organizer, participants and note, printed as typed (ADR 0060). Every approved akce
 * owes a report, so there is nothing to tick for it (ADR 0048). Each change goes to the editor by
 * name; `issues` holds the messages of the last refused save, by field name.
 */
export function FutureFields({
  edit,
  issues,
  readOnly,
  onPatch,
  onBlur,
}: {
  readonly edit: FutureEdit;
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly onPatch: (name: PatchName, value: string) => void;
  /** Leaving a field saves at once. */
  readonly onBlur: () => void;
}) {
  const { content } = edit;
  /** A field's name with the change that belongs to it, so the two cannot drift apart. */
  const bound = <N extends PatchName>(name: N) => ({
    name,
    onChange: (value: string) => onPatch(name, value),
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
        <DateField {...bound('startDate')} initial={content.startDate} />
        <DateField {...bound('endDate')} initial={content.endDate} />
      </div>
      {isMultiDay(content) ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField {...bound('timeFrom')} type="time" value={content.timeFrom ?? ''} />
          <TextField {...bound('timeTo')} type="time" value={content.timeTo ?? ''} />
        </div>
      )}
      <RadioGroupField
        name="campus"
        options={CAMPUS_OPTIONS}
        value={content.campus ?? ''}
        onChange={bound('campus').onChange}
        readOnly={readOnly}
      />
      <TextField
        {...bound('place')}
        description={content.campus ? points.editor.placeHint : future.editor.placeNeedsCampus}
        disabled={!content.campus}
        maxLength={POINT_LIMITS.place}
        value={content.place ?? ''}
        autoComplete="off"
      />
      <RadioGroupField
        name="organizerRole"
        options={ROLE_OPTIONS}
        value={content.organizerRole ?? ''}
        onChange={bound('organizerRole').onChange}
        readOnly={readOnly}
        {...(bound('organizerRole').issue === undefined
          ? {}
          : { issue: bound('organizerRole').issue })}
      />
      <TextField
        {...bound('organizer')}
        description={future.editor.organizerHint}
        maxLength={POINT_LIMITS.organizer}
        value={organizerOnOneLine(content.organizer ?? '')}
      />
      <TextField
        {...bound('participants')}
        description={future.editor.participantsHint}
        multiline
        maxLength={POINT_LIMITS.participants}
        value={content.participants ?? ''}
      />
      <TextField
        {...bound('note')}
        description={future.editor.noteHint}
        multiline
        maxLength={POINT_LIMITS.futureNote}
        value={content.note ?? ''}
      />
    </>
  );
}
