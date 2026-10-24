'use client';

import { startTransition, useEffect, useRef, useState, type FormEvent } from 'react';

import type { FieldIssues, ServerAction } from '@/contracts';
import type { FormState } from './context';
import { enterErrorTitle, leaveErrorTitle } from './error-title';
import { settle, type Problem, type Settled } from './settle';

/** While this form has field issues the tab title starts with „Chyba:“ (once, however many forms fail). */
function useErrorTitle(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    enterErrorTitle(document);
    return () => leaveErrorTitle(document);
  }, [active]);
}

/** The pressed submit button's name and value, if the browser says which one. */
function submitterOf(event: FormEvent<HTMLFormElement>): HTMLButtonElement | null {
  const { submitter } = event.nativeEvent as SubmitEvent;
  return submitter instanceof HTMLButtonElement ? submitter : null;
}

/**
 * Runs a server action for the form that owns this hook and returns the state
 * `Form` takes. A result becomes issues, a problem or success (see `settle`);
 * a rejected action is a `network` problem. Only one submit is in flight, and
 * every failure bumps `attempt` so the form moves focus to its message.
 */
export function useActionForm<In, Out>({
  action,
  toInput,
  onSuccess,
}: {
  readonly action: ServerAction<In, Out>;
  /** Maps the fields to the action's input; a throw here is a bug, not a network problem. */
  readonly toInput: (data: FormData) => In;
  readonly onSuccess?: (value: Out) => void;
}): FormState {
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const inFlight = useRef(false);
  useErrorTitle(issues !== null);

  function apply(settled: Settled<Out>) {
    inFlight.current = false;
    setSubmitting(null);
    if (settled.kind === 'ok') {
      setIssues(null);
      setProblem(null);
      onSuccess?.(settled.value);
      return;
    }
    setIssues(settled.kind === 'issues' ? settled.issues : null);
    setProblem(settled.kind === 'problem' ? settled.problem : null);
    setAttempt((n) => n + 1);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const submitter = submitterOf(event);
    if (submitter !== null && submitter.name !== '') data.set(submitter.name, submitter.value);
    const input = toInput(data);
    inFlight.current = true;
    setSubmitting(submitter?.value ?? '');
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof action>> | 'network';
      try {
        result = await action(input);
      } catch {
        result = 'network';
      }
      startTransition(() => apply(settle(result)));
    });
  }

  return { issues, problem, attempt, submitting, onSubmit };
}
