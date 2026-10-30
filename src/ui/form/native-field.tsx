'use client';

import { form } from '@/ui/copy';
import { Icon } from '@/ui/kit';

import { useFormContext } from './context';
import { fieldId, fieldMessage } from './spec';

/**
 * What a native control needs from the form's spec: the label text with the
 * optional marker, the three ids, `aria-describedby` for what is rendered, and
 * the issue message. `label` overrides the spec's label. `issue` is a message of the
 * page's own (an autosave refused the value) and, when given, shows in place of the
 * form's issue for the field.
 */
export function useNativeField(
  name: string,
  {
    label,
    description,
    issue,
    optionalMark = true,
  }: {
    readonly label?: string;
    readonly description?: string;
    readonly issue?: string;
    /** False: no „(nepovinné)“ after the label of a box that is optional by nature. */
    readonly optionalMark?: boolean;
  },
) {
  const { formId, spec, issues } = useFormContext();
  const field = spec[name];
  if (field === undefined) throw new Error(`The form spec has no field "${name}".`);
  const code = issues?.[name];
  const invalid = code !== undefined || issue !== undefined;
  const required = field.required === true;
  const text = label ?? field.label;
  const id = fieldId(formId, name);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [
    ...(description === undefined ? [] : [descriptionId]),
    ...(invalid ? [errorId] : []),
  ].join(' ');
  return {
    id,
    label: required || !optionalMark ? text : `${text} ${form.optional}`,
    required,
    invalid,
    describedBy: describedBy === '' ? undefined : describedBy,
    descriptionId,
    errorId,
    message: issue ?? (code === undefined ? null : fieldMessage(spec, name, code)),
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
