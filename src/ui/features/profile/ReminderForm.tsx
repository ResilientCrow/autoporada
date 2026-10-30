'use client';

import type { z } from 'zod';

import type { ServerAction, setRemindersInput, setRemindersOutput } from '@/contracts';
import { profile } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import { remindersInput } from './inputs';

export type RemindersAction = ServerAction<
  z.input<typeof setRemindersInput>,
  z.output<typeof setRemindersOutput>
>;

const SPEC: FormSpec = { on: { label: profile.reminders.label } };

/** The reminder box and its „Uložit“; the host says what the answer was. */
export function ReminderForm({
  action,
  remindDeadline,
  onSaved,
}: {
  readonly action: RemindersAction;
  readonly remindDeadline: boolean;
  readonly onSaved: (changed: boolean) => void;
}) {
  const state = useActionForm({
    action,
    toInput: remindersInput,
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id="pripominky" spec={SPEC} state={state}>
      <CheckboxField
        name="on"
        optionalMark={false}
        description={profile.reminders.description}
        defaultChecked={remindDeadline}
      />
      <SubmitButton>{profile.reminders.save}</SubmitButton>
    </Form>
  );
}
