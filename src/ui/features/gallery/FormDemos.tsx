'use client';

import type { FormEvent } from 'react';

import type { FieldIssues } from '@/contracts';
import { gallery } from '@/ui/copy';
import { Form, TextField, type FormSpec } from '@/ui/form';
import { Button } from '@/ui/kit';

const { forms } = gallery;

const PLAIN: FormSpec = {
  name: { label: forms.plain.name, required: true },
  nickname: { label: forms.plain.nickname },
  reason: { label: forms.plain.reason, required: true },
};

const FAILED: FormSpec = {
  name: { label: forms.failed.name, required: true },
  reason: {
    label: forms.failed.reason,
    required: true,
    messages: { 'too-long': forms.failed.reasonTooLong },
  },
};

const ISSUES: FieldIssues = { name: 'required', reason: 'too-long' };

function stay(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

/** Two static forms: one clean, one showing the error anatomy. Submitting does nothing. */
export function FormDemos() {
  return (
    <div className="flex flex-col gap-6">
      <Form id="demo-plain" spec={PLAIN} issues={null} onSubmit={stay}>
        <TextField name="name" autoComplete="name" />
        <TextField name="nickname" description={forms.plain.nicknameHint} />
        <TextField name="reason" multiline />
        <div>
          <Button type="submit">{forms.submit}</Button>
        </div>
      </Form>
      <Form id="demo-failed" spec={FAILED} issues={ISSUES} onSubmit={stay}>
        <TextField name="name" />
        <TextField name="reason" multiline maxLength={200} />
        <div>
          <Button type="submit">{forms.submit}</Button>
        </div>
      </Form>
    </div>
  );
}
