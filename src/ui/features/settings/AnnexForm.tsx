'use client';

import { settings } from '@/ui/copy';
import { Form, SubmitButton, TextField, useActionForm, type FormSpec } from '@/ui/form';

import type { SaveAction } from './DeadlineForm';
import { annexInput, introText, type IntroDoc } from './inputs';

const { annex1 } = settings;

const SPEC: FormSpec = {
  'value.heading': {
    label: annex1.heading.label,
    required: true,
    messages: { 'too-long': annex1.heading.tooLong },
  },
  'value.intro': {
    label: annex1.intro.label,
    required: true,
    messages: { 'too-long': annex1.intro.tooLong },
  },
};

/** The heading and intro above the list of annex 1; the intro is plain paragraphs until the rich field (row 48). */
export function AnnexForm({
  action,
  value,
  version,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly value: { readonly heading: string; readonly intro: IntroDoc };
  readonly version: number;
  readonly onSaved: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: (data) => annexInput(version, data),
    onSuccess: onSaved,
  });
  return (
    <Form id="priloha-1" spec={SPEC} state={state}>
      <TextField name="value.heading" defaultValue={value.heading} />
      <TextField
        name="value.intro"
        multiline
        defaultValue={introText(value.intro)}
        description={annex1.intro.description}
      />
      <SubmitButton>{settings.save}</SubmitButton>
    </Form>
  );
}
