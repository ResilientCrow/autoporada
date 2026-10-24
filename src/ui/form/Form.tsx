'use client';

import { useRef, type ReactNode } from 'react';
import { Form as AriaForm } from 'react-aria-components/Form';
import { I18nProvider } from 'react-aria-components/I18nProvider';

import { FormProvider, type FormState } from './context';
import { ErrorSummary } from './ErrorSummary';
import { FormProblem } from './FormProblem';
import { summaryItems, type FormSpec } from './spec';
import { useFocusOnRise } from './use-focus-on-rise';

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
 * The error summary leads the form when `state.issues` has entries; otherwise
 * a `state.problem` does, never both. Whichever leads takes focus only when
 * `state.attempt` (failed submits) rises after mount, never on mount.
 */
export function Form({
  id,
  spec,
  state,
  children,
}: {
  readonly id: string;
  readonly spec: FormSpec;
  readonly state: FormState;
  readonly children: ReactNode;
}) {
  const { issues, problem, attempt, submitting, onSubmit } = state;
  const leadRef = useRef<HTMLDivElement>(null);
  useFocusOnRise(leadRef, attempt);
  const items = issues === null ? [] : summaryItems(id, spec, issues);
  let lead: ReactNode = null;
  if (items.length > 0) lead = <ErrorSummary items={items} summaryRef={leadRef} />;
  else if (problem !== null) lead = <FormProblem problem={problem} focusRef={leadRef} />;

  return (
    <I18nProvider locale="cs-CZ">
      <FormProvider value={{ formId: id, spec, issues, submitting }}>
        <AriaForm
          id={id}
          method="post"
          validationBehavior="aria"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          {lead}
          {children}
        </AriaForm>
      </FormProvider>
    </I18nProvider>
  );
}
