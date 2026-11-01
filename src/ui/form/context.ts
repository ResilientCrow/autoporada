import { createContext, useContext, type FormEvent } from 'react';

import type { FieldIssues } from '@/contracts';

import type { Problem } from './settle';
import type { FormSpec } from './spec';

/** What a form shows and does: field issues, or a problem, the failed-submit count, and the submit handler. */
export interface FormState {
  readonly issues: FieldIssues | null;
  readonly problem: Problem | null;
  /** Rises on every failed submit. */
  readonly attempt: number;
  /** The pressed submit button's value ('' if unnamed); null when idle. */
  readonly submitting: string | null;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** The form's action only reads, so a failure does not say „Změny se neuložily“. */
  readonly readOnly?: boolean;
}

export interface FormContextValue {
  readonly formId: string;
  readonly spec: FormSpec;
  readonly issues: FieldIssues | null;
  readonly submitting: string | null;
}

const FormContext = createContext<FormContextValue | null>(null);

export const FormProvider = FormContext.Provider;

/** The enclosing `Form`'s declaration and issues; a field outside a form is a bug. */
export function useFormContext(): FormContextValue {
  const value = useContext(FormContext);
  if (value === null) throw new Error('A form field must be rendered inside a Form.');
  return value;
}
