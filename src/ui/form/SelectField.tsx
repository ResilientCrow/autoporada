'use client';

import { CONTROL } from './control-styles';
import { NativeFieldError, useNativeField } from './native-field';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A labelled native select. It always has a value (no placeholder option): the
 * `defaultValue`, else the first option. The id sits on the `<select>` itself so
 * the label and the error summary reach it. The order is label, description,
 * error, control.
 */
export function SelectField({
  name,
  options,
  defaultValue,
  description,
  onChange,
}: {
  readonly name: string;
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string;
  readonly description?: string;
  readonly onChange?: (value: string) => void;
}) {
  const field = useNativeField(name, { description });

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={field.id} className="font-bold">
        {field.label}
      </label>
      {description === undefined ? null : <span id={field.descriptionId}>{description}</span>}
      {field.message === null ? null : (
        <NativeFieldError id={field.errorId} message={field.message} />
      )}
      <select
        id={field.id}
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        aria-required={field.required ? true : undefined}
        aria-invalid={field.invalid ? true : undefined}
        aria-describedby={field.describedBy}
        onChange={onChange === undefined ? undefined : (e) => onChange(e.target.value)}
        className={CONTROL}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
