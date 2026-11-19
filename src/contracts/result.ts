import type { FailureCause } from './failure';
import type { RuleCode } from './rules';

/**
 * What is wrong with one input field; the form shows the Czech text for it. `several`: the choice
 * needs more than one person (the address „slečny a pánové“, ADR 0071).
 */
export type FieldIssueCode = 'required' | 'too-short' | 'too-long' | 'invalid' | 'several';

/** Field path → issue, e.g. `{ 'statements.0.quote': 'required' }`. */
export type FieldIssues = Readonly<Record<string, FieldIssueCode>>;

/**
 * Why an action did not happen. Codes only: no text crosses the wire, except
 * `unavailable`'s `detail`, a technical line the server sends in development
 * alone (ADR 0044). The request id stays in the log.
 */
export type ActionError =
  | { readonly code: 'invalid-input'; readonly fields: FieldIssues }
  | {
      readonly code:
        'unauthenticated' | 'step-up-required' | 'forbidden' | 'not-found' | 'conflict' | 'busy';
    }
  | { readonly code: 'rule'; readonly rule: RuleCode }
  | { readonly code: 'rate-limited'; readonly retryAfterSeconds: number }
  | { readonly code: 'unavailable'; readonly cause: FailureCause; readonly detail?: string };

export type ErrorCode = ActionError['code'];

/** One key per code; `Record<ErrorCode, …>` fails to compile when a code is missing or extra. */
const CODE_SET = {
  'invalid-input': true,
  unauthenticated: true,
  'step-up-required': true,
  forbidden: true,
  'not-found': true,
  conflict: true,
  busy: true,
  rule: true,
  'rate-limited': true,
  unavailable: true,
} as const satisfies Record<ErrorCode, true>;

/** Every error code, for what must cover them all (copy, `settle`). */
export const ERROR_CODES = Object.keys(CODE_SET) as readonly ErrorCode[];

export type ActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ActionError };
