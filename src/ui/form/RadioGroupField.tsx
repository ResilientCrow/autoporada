'use client';

import { NativeFieldError, useNativeField } from './native-field';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A native radio group: a fieldset whose legend is the spec's label. It has no
 * choice unless `defaultValue` names one, so a missing choice is the server's
 * field issue. The fieldset carries the id (the error summary focuses it), the
 * description and the error wiring; each radio row is a label around the
 * input, at least 44 px tall. The order is legend, description, error, radios.
 */
export function RadioGroupField({
  name,
  options,
  defaultValue,
  description,
}: {
  readonly name: string;
  readonly options: readonly RadioOption[];
  readonly defaultValue?: string;
  readonly description?: string;
}) {
  const field = useNativeField(name, { description });

  return (
    <fieldset
      id={field.id}
      tabIndex={-1}
      role="radiogroup"
      aria-required={field.required ? true : undefined}
      aria-invalid={field.invalid ? true : undefined}
      aria-describedby={field.describedBy}
      className="flex flex-col gap-1"
    >
      <legend className="font-bold">{field.label}</legend>
      {description === undefined ? null : <span id={field.descriptionId}>{description}</span>}
      {field.message === null ? null : (
        <NativeFieldError id={field.errorId} message={field.message} />
      )}
      {options.map((option, i) => (
        <label key={option.value} className="flex min-h-11 items-center gap-3">
          <input
            id={`${field.id}-${i}`}
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            className="size-6 shrink-0 accent-digital"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
