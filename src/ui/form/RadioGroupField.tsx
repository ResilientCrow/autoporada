'use client';

import { NativeFieldError, useNativeField } from './native-field';
import { chooseOnPress, keepOnPress } from './radio-press';

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
 * With `value` and `onChange` it is controlled.
 */
export function RadioGroupField({
  name,
  options,
  defaultValue,
  value,
  onChange,
  readOnly = false,
  description,
  issue,
}: {
  readonly name: string;
  readonly options: readonly RadioOption[];
  readonly defaultValue?: string;
  /** Controlled use, with `onChange`; leave `defaultValue` out. An empty string checks none. */
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  /** Shown, but a press changes nothing, controlled or not (an autosaving editor waiting on its banner). */
  readonly readOnly?: boolean;
  readonly description?: string;
  /** A message of the page's own (an autosave refused the value), shown in place of the form's. */
  readonly issue?: string;
}) {
  const field = useNativeField(name, { description, ...(issue === undefined ? {} : { issue }) });

  return (
    <fieldset
      id={field.id}
      tabIndex={-1}
      role="radiogroup"
      aria-required={field.required ? true : undefined}
      aria-invalid={field.invalid ? true : undefined}
      aria-readonly={readOnly ? true : undefined}
      aria-describedby={field.describedBy}
      className="flex flex-col gap-1"
    >
      <legend className="font-bold">{field.label}</legend>
      {description === undefined ? null : (
        <span id={field.descriptionId} className="text-sm">
          {description}
        </span>
      )}
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
            {...(value === undefined
              ? {
                  defaultChecked: option.value === defaultValue,
                  onClick: (event) => keepOnPress(readOnly, event),
                }
              : {
                  checked: option.value === value,
                  onChange: () => chooseOnPress(option.value, readOnly, onChange),
                })}
            className="size-6 shrink-0 accent-digital"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
