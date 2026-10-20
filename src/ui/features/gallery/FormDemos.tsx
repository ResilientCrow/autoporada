'use client';

import { useState, type FormEvent } from 'react';

import type { FieldIssueCode, FieldIssues } from '@/contracts';
import { gallery } from '@/ui/copy';
import { Form, TextField, textOf, type FormSpec } from '@/ui/form';
import { Button, Notice } from '@/ui/kit';

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

const LIVE: FormSpec = {
  name: { label: forms.live.name, required: true },
  reason: {
    label: forms.live.reason,
    required: true,
    messages: { 'too-long': forms.live.reasonTooLong },
  },
};

/** Long enough for a sentence; the live demo checks it in onSubmit, as a server would. */
const REASON_LIMIT = 40;

const ISSUES: FieldIssues = { name: 'required', reason: 'too-long' };

function stay(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

function check(data: FormData): FieldIssues | null {
  const reason = textOf(data, 'reason').trim();
  const issues: Record<string, FieldIssueCode> = {
    ...(textOf(data, 'name').trim() === '' ? { name: 'required' } : {}),
    ...(reason === '' ? { reason: 'required' } : {}),
    ...(reason.length > REASON_LIMIT ? { reason: 'too-long' } : {}),
  };
  return Object.keys(issues).length === 0 ? null : issues;
}

/** Validates locally and tells the form how many attempts failed, as a real action will. */
function LiveDemo() {
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = check(new FormData(event.currentTarget));
    setIssues(found);
    setSent(found === null);
    if (found !== null) setAttempt((n) => n + 1);
  }

  const done = sent ? <Notice tone="info">{forms.live.sent}</Notice> : null;
  return (
    <Form id="demo-live" spec={LIVE} issues={issues} attempt={attempt} onSubmit={submit}>
      <TextField name="name" />
      <TextField name="reason" multiline />
      <div>
        <Button type="submit">{forms.submit}</Button>
      </div>
      {done}
    </Form>
  );
}

/** Two static forms (clean, and the error anatomy; submitting does nothing) and a live one. */
export function FormDemos() {
  return (
    <div className="flex flex-col gap-6">
      <Form id="demo-plain" spec={PLAIN} issues={null} attempt={0} onSubmit={stay}>
        <TextField name="name" autoComplete="name" />
        <TextField name="nickname" description={forms.plain.nicknameHint} />
        <TextField name="reason" multiline />
        <div>
          <Button type="submit">{forms.submit}</Button>
        </div>
      </Form>
      <Form id="demo-failed" spec={FAILED} issues={ISSUES} attempt={0} onSubmit={stay}>
        <TextField name="name" />
        <TextField name="reason" multiline maxLength={200} />
        <div>
          <Button type="submit">{forms.submit}</Button>
        </div>
      </Form>
      <LiveDemo />
    </div>
  );
}
