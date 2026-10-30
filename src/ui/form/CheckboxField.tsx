'use client';

import { NativeFieldError, useNativeField } from './native-field';

/**
 * A labelled native checkbox; it submits "on" when checked. The label row wraps
 * the box (a target of at least 44 px), with the description and the error
 * under it. The label is `label` when given, else the spec's.
 */
export function CheckboxField({
  name,
  label,
  description,
  defaultChecked = false,
  optionalMark = true,
  disabled = false,
  onChange,
}: {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly defaultChecked?: boolean;
  /** False for a box that is optional by nature (a switch, a flag): its label gets no „(nepovinné)“. */
  readonly optionalMark?: boolean;
  /** Shown but not changeable (an autosaving editor waiting on its banner). */
  readonly disabled?: boolean;
  /** Called with the new state; the box stays uncontrolled. */
  readonly onChange?: (checked: boolean) => void;
}) {
  const field = useNativeField(name, { label, description, optionalMark });

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={field.id} className="flex min-h-11 items-start gap-3 font-bold">
        <input
          id={field.id}
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          onChange={onChange === undefined ? undefined : (e) => onChange(e.target.checked)}
          aria-required={field.required ? true : undefined}
          aria-invalid={field.invalid ? true : undefined}
          aria-describedby={field.describedBy}
          className="size-6 shrink-0 accent-digital"
        />
        <span>{field.label}</span>
      </label>
      {description === undefined ? null : <span id={field.descriptionId}>{description}</span>}
      {field.message === null ? null : (
        <NativeFieldError id={field.errorId} message={field.message} />
      )}
    </div>
  );
}
