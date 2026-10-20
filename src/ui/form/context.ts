import { createContext, useContext } from 'react';

import type { FieldIssues } from '@/contracts';

import type { FormSpec } from './spec';

export interface FormContextValue {
  readonly formId: string;
  readonly spec: FormSpec;
  readonly issues: FieldIssues | null;
}

const FormContext = createContext<FormContextValue | null>(null);

export const FormProvider = FormContext.Provider;

/** The enclosing `Form`'s declaration and issues; a field outside a form is a bug. */
export function useFormContext(): FormContextValue {
  const value = useContext(FormContext);
  if (value === null) throw new Error('A form field must be rendered inside a Form.');
  return value;
}
