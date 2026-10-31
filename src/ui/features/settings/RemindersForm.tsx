'use client';

import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';
import { settings } from '@/ui/copy';

import type { SaveAction } from './DeadlineForm';
import { remindersInput } from './inputs';

const SPEC: FormSpec = {
  'value.soft': { label: settings.reminders.soft },
  'value.hard': { label: settings.reminders.hard },
};

/** The two reminder mails, each on or off for everyone. */
export function RemindersForm({
  action,
  value,
  version,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly value: { readonly soft: boolean; readonly hard: boolean };
  readonly version: number;
  readonly onSaved: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: (data) => remindersInput(version, data),
    onSuccess: onSaved,
  });
  return (
    <Form id="pripominky" spec={SPEC} state={state}>
      <p>{settings.reminders.intro}</p>
      <CheckboxField name="value.soft" optionalMark={false} defaultChecked={value.soft} />
      <CheckboxField name="value.hard" optionalMark={false} defaultChecked={value.hard} />
      <SubmitButton>{settings.save}</SubmitButton>
    </Form>
  );
}
