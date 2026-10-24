'use client';

import { form } from '@/ui/copy';
import { Icon } from '@/ui/kit';

import { useFormContext } from './context';
import { fieldId, fieldMessage } from './spec';

/**
 * What a native control needs from the form's spec: the label text with the
 * optional marker, the three ids, `aria-describedby` for what is rendered, and
 * the issue message. `label` overrides the spec's label.
 */
export function useNativeField(
  name: string,
  { label, description }: { readonly label?: string; readonly description?: string },
) {
  const { formId, spec, issues } = useFormContext();
  const field = spec[name];
  if (field === undefined) throw new Error(`The form spec has no field "${name}".`);
  const code = issues?.[name];
  const required = field.required === true;
  const text = label ?? field.label;
  const id = fieldId(formId, name);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [
    ...(description === undefined ? [] : [descriptionId]),
    ...(code === undefined ? [] : [errorId]),
  ].join(' ');
  return {
    id,
    label: required ? text : `${text} ${form.optional}`,
    required,
    invalid: code !== undefined,
    describedBy: describedBy === '' ? undefined : describedBy,
    descriptionId,
    errorId,
    message: code === undefined ? null : fieldMessage(spec, name, code),
  };
}

/** The inline error: an icon, a screen-reader-only prefix, then the message. */
export function NativeFieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string;
}) {
  const hiddenPrefix = `${form.errorPrefix} `;
  return (
    <div id={id} className="flex items-start gap-2 font-bold text-ink">
      <Icon name="exclamation" />
      <span className="sr-only">{hiddenPrefix}</span>
      <span>{message}</span>
    </div>
  );
}
