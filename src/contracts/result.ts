import type { RuleCode } from './rules';

/** What is wrong with one input field; the form shows the Czech text for it. */
export type FieldIssueCode = 'required' | 'too-short' | 'too-long' | 'invalid';

/** Field path → issue, e.g. `{ 'statements.0.quote': 'required' }`. */
export type FieldIssues = Readonly<Record<string, FieldIssueCode>>;

/**
 * Why an action did not happen. Codes only: no text crosses the wire, and
 * the one free-form value is the request id the user can report.
 */
export type ActionError =
  | { readonly code: 'invalid-input'; readonly fields: FieldIssues }
  | {
      readonly code:
        'unauthenticated' | 'step-up-required' | 'forbidden' | 'not-found' | 'conflict' | 'busy';
    }
  | { readonly code: 'rule'; readonly rule: RuleCode }
  | { readonly code: 'rate-limited'; readonly retryAfterSeconds: number }
  | { readonly code: 'unavailable'; readonly requestId: string };

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

/** A server action as client components call it: one plain object in, a result out. */
export type ServerAction<In, Out> = (input: In) => Promise<ActionResult<Out>>;
