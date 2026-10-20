'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Form as AriaForm } from 'react-aria-components/Form';
import { I18nProvider } from 'react-aria-components/I18nProvider';

import type { FieldIssues } from '@/contracts';

import { FormProvider } from './context';
import { ErrorSummary } from './ErrorSummary';
import { summaryItems, type FormSpec } from './spec';

/**
 * A POST form that only the server contract validates: `validationBehavior="aria"`
 * renders `noValidate`, so no browser bubble competes with our messages. Errors
 * come from `issues`, never React Aria's `validationErrors` (it clears them on
 * edit and the summary would disagree).
 *
 * There is deliberately no `action` prop. A function `<form action>` makes React
 * 19 reset uncontrolled fields after it runs and server-renders a `javascript:`
 * action plus an inline replay script, which the CSP refuses (ADR 0012).
 *
 * The error summary leads the form when `issues` has entries. It takes focus
 * only when `attempt` (failed submits) rises after mount, never on mount, so a
 * page that loads with issues leaves the first Tab to the skip link.
 */
export function Form({
  id,
  spec,
  issues,
  attempt,
  onSubmit,
  children,
}: {
  readonly id: string;
  readonly spec: FormSpec;
  readonly issues: FieldIssues | null;
  readonly attempt: number;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly children: ReactNode;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const seenAttempt = useRef(attempt);
  useEffect(() => {
    if (attempt > seenAttempt.current) summaryRef.current?.focus();
    seenAttempt.current = attempt;
  }, [attempt]);
  const items = issues === null ? [] : summaryItems(id, spec, issues);
  const summary =
    items.length === 0 ? null : <ErrorSummary items={items} summaryRef={summaryRef} />;

  return (
    <I18nProvider locale="cs-CZ">
      <FormProvider value={{ formId: id, spec, issues }}>
        <AriaForm
          id={id}
          method="post"
          validationBehavior="aria"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          {summary}
          {children}
        </AriaForm>
      </FormProvider>
    </I18nProvider>
  );
}
