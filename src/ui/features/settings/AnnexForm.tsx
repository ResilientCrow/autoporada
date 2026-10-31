'use client';

import { ANNEX1_MAX_BYTES, type RichDoc } from '@/domain/richtext';
import { settings } from '@/ui/copy';
import {
  Form,
  RichTextField,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import type { SaveAction } from './DeadlineForm';
import { annexInput } from './inputs';

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

/** The heading and intro above the list of annex 1; the intro is a rich text of plain paragraphs. */
export function AnnexForm({
  action,
  value,
  version,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly value: { readonly heading: string; readonly intro: RichDoc };
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
      <p>{annex1.intro.description}</p>
      <RichTextField
        name="value.intro"
        profile="paragraphs"
        defaultValue={value.intro}
        maxBytes={ANNEX1_MAX_BYTES}
      />
      <SubmitButton>{settings.save}</SubmitButton>
    </Form>
  );
}
