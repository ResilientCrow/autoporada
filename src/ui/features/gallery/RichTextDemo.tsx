'use client';

import type { FormEvent } from 'react';

import { gallery } from '@/ui/copy';
import { Form, RichTextField, type FormSpec, type FormState } from '@/ui/form';
import { LIMITS, richDocFromText } from '@/domain/richtext';

const { richtext } = gallery;

const SPEC: FormSpec = {
  doc: { label: richtext.label, required: true },
  plain: { label: richtext.paragraphs, required: true },
};

const STAY: FormState = {
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: (event: FormEvent<HTMLFormElement>) => event.preventDefault(),
};

const START = richDocFromText('První řádek\nDruhý řádek');

/** The editor in both profiles, in a form whose submit does nothing; the hidden input holds the JSON. */
export function RichTextDemo() {
  return (
    <Form id="demo-richtext" spec={SPEC} state={STAY}>
      <RichTextField name="doc" profile="outline" defaultValue={START} maxBytes={LIMITS.maxBytes} />
      <RichTextField
        name="plain"
        profile="paragraphs"
        defaultValue={START}
        maxBytes={LIMITS.maxBytes}
      />
    </Form>
  );
}
