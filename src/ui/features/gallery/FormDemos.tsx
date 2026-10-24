'use client';

import { useState, type FormEvent } from 'react';

import type { ActionResult, FieldIssueCode, FieldIssues, ServerAction } from '@/contracts';
import { gallery } from '@/ui/copy';
import {
  Form,
  LiveStatus,
  NoScriptNotice,
  SubmitButton,
  TextField,
  textOf,
  useActionForm,
  type FormSpec,
  type FormState,
} from '@/ui/form';

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

const IDLE: FormState = {
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: stay,
};

interface LiveInput {
  readonly name: string;
  readonly reason: string;
}

function check(input: LiveInput): FieldIssues | null {
  const reason = input.reason.trim();
  const issues: Record<string, FieldIssueCode> = {
    ...(input.name.trim() === '' ? { name: 'required' } : {}),
    ...(reason === '' ? { reason: 'required' } : {}),
    ...(reason.length > REASON_LIMIT ? { reason: 'too-long' } : {}),
  };
  return Object.keys(issues).length === 0 ? null : issues;
}

/** What a server would answer: issues for bad input, `unavailable` when asked, a rejection for the trigger word. */
function liveAction(unavailable: boolean): ServerAction<LiveInput, null> {
  return async (input): Promise<ActionResult<null>> => {
    const fields = check(input);
    if (fields !== null) return { ok: false, error: { code: 'invalid-input', fields } };
    if (input.name.trim() === forms.live.networkTrigger) throw new Error('network');
    if (unavailable) {
      return { ok: false, error: { code: 'unavailable', requestId: 'abcdef12-3456' } };
    }
    return { ok: true, data: null };
  };
}

function toLiveInput(data: FormData): LiveInput {
  return { name: textOf(data, 'name'), reason: textOf(data, 'reason') };
}

/** The live form: it runs the stub action as a real form runs a server action; success goes to a live region. */
function LiveDemo({ unavailable }: { readonly unavailable: boolean }) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const state = useActionForm({
    action: liveAction(unavailable),
    toInput: toLiveInput,
    onSuccess: () => setSaid((s) => ({ message: forms.live.sent, count: s.count + 1 })),
  });
  return (
    <div className="flex flex-col gap-4">
      <NoScriptNotice />
      <Form id="demo-live" spec={LIVE} state={state}>
        <TextField name="name" />
        <TextField name="reason" multiline />
        <div>
          <SubmitButton>{forms.submit}</SubmitButton>
        </div>
      </Form>
      <LiveStatus message={said.message} count={said.count} />
    </div>
  );
}

/** Two static forms (clean, and the error anatomy; submitting does nothing) and a live one. */
export function FormDemos({ unavailable }: { readonly unavailable: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Form id="demo-plain" spec={PLAIN} state={IDLE}>
        <TextField name="name" autoComplete="name" />
        <TextField name="nickname" description={forms.plain.nicknameHint} />
        <TextField name="reason" multiline />
        <div>
          <SubmitButton>{forms.submit}</SubmitButton>
        </div>
      </Form>
      <Form id="demo-failed" spec={FAILED} state={{ ...IDLE, issues: ISSUES }}>
        <TextField name="name" />
        <TextField name="reason" multiline maxLength={200} />
        <div>
          <SubmitButton>{forms.submit}</SubmitButton>
        </div>
      </Form>
      <LiveDemo unavailable={unavailable} />
    </div>
  );
}
