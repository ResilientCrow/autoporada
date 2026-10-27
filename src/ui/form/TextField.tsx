'use client';

import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  TextField as AriaTextField,
} from 'react-aria-components/TextField';

import { form } from '@/ui/copy';
import { Icon } from '@/ui/kit';

import { CONTROL } from './control-styles';
import { useFormContext } from './context';
import { fieldId, fieldMessage } from './spec';

/**
 * A labelled text field, single line or `multiline`. Its label, required marker,
 * message and id all come from the form's spec; the id goes on the field, not
 * the input, or the label's `for` breaks. The order is Label, description,
 * error, control.
 */
export function TextField({
  name,
  description,
  multiline = false,
  defaultValue,
  value,
  onChange,
  onBlur,
  maxLength,
  autoComplete,
}: {
  readonly name: string;
  readonly description?: string;
  readonly multiline?: boolean;
  readonly defaultValue?: string;
  /** Controlled use: the text, and what to do with a change and on leaving the field. */
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onBlur?: () => void;
  readonly maxLength?: number;
  readonly autoComplete?: string;
}) {
  const { formId, spec, issues } = useFormContext();
  const field = spec[name];
  if (field === undefined) throw new Error(`The form spec has no field "${name}".`);
  const code = issues?.[name];
  const required = field.required === true;
  const label = required ? field.label : `${field.label} ${form.optional}`;
  const message = code === undefined ? '' : fieldMessage(spec, name, code);
  const hiddenPrefix = `${form.errorPrefix} `;

  return (
    <AriaTextField
      id={fieldId(formId, name)}
      name={name}
      isRequired={required}
      isInvalid={code !== undefined}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      maxLength={maxLength}
      autoComplete={autoComplete}
      className="flex flex-col gap-1"
    >
      <Label className="font-bold">{label}</Label>
      {description === undefined ? null : <Text slot="description">{description}</Text>}
      <FieldError className="flex items-start gap-2 font-bold text-ink">
        <Icon name="exclamation" />
        <span className="sr-only">{hiddenPrefix}</span>
        <span>{message}</span>
      </FieldError>
      {multiline ? <TextArea rows={5} className={CONTROL} /> : <Input className={CONTROL} />}
    </AriaTextField>
  );
}
