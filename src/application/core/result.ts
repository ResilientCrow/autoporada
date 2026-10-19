import type { FieldIssues, RuleCode } from '@/contracts';

export type Result<T, F> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: F };

/** What a use case may answer instead of doing its work. */
export type UseCaseFailure =
  | { readonly code: 'not-found' | 'forbidden' | 'conflict' }
  | { readonly code: 'rule'; readonly rule: RuleCode }
  | { readonly code: 'invalid-input'; readonly fields: FieldIssues };

/** Failures only the pipeline produces, on top of the use case's own. */
export type PipelineFailure = UseCaseFailure | { readonly code: 'step-up-required' | 'busy' };

export type Outcome<T> = Result<T, UseCaseFailure>;

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const fail = (error: UseCaseFailure): Outcome<never> => ({ ok: false, error });
