'use client';

import type { FutureKind } from '@/domain/calendar';
import { POINT_LIMITS } from '@/domain/report';
import { future, points } from '@/ui/copy';
import { CheckboxField, DateField, RadioGroupField, TextField } from '@/ui/form';

import { CAMPUSES, type FutureEdit, type PatchName, type ResponsibleDraft } from './edit';
import { ResponsibleFields, type PickerContext } from './ResponsibleFields';

const CAMPUS_OPTIONS = CAMPUSES.map((campus) => ({ value: campus, label: points.campus[campus] }));

/**
 * The fields of an item in page order (design section 12): title, the dates and times as native
 * controls with their ISO value, campus, place, who is responsible and, for an akce, whether a
 * report follows. Each change goes to the editor by name; `issues` holds the messages of the last
 * refused save, by field name.
 */
export function FutureFields({
  kind,
  edit,
  issues,
  readOnly,
  picker,
  onPatch,
  onResponsible,
  onExpectsReport,
  onBlur,
}: {
  readonly kind: FutureKind;
  readonly edit: FutureEdit;
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly picker: PickerContext;
  readonly onPatch: (name: PatchName, value: string) => void;
  readonly onResponsible: (change: Partial<ResponsibleDraft>) => void;
  readonly onExpectsReport: (checked: boolean) => void;
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
      <ResponsibleFields
        value={edit.responsible}
        issues={issues}
        readOnly={readOnly}
        picker={picker}
        onChange={onResponsible}
        onBlur={onBlur}
      />
      {kind === 'akce' ? (
        <CheckboxField
          name="expectsReport"
          label={future.editor.expectsReport}
          defaultChecked={content.expectsReport}
          optionalMark={false}
          disabled={readOnly}
          issue={issues['expectsReport']}
          onChange={onExpectsReport}
        />
      ) : null}
    </>
  );
}
