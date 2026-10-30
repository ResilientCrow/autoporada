import type { ActionResult, RuleCode } from '@/contracts';

import type { SaveAnswer, StatusAnswer } from './machine';

/**
 * What the autosave machine hears of a save: the server's answer in its own words. `notEditable`
 * is the rule the editor's use case answers when the state moved on (`point-not-editable`,
 * `future-not-editable`); any other rule is a failure.
 */
export function saveAnswerOf(
  result: ActionResult<{ readonly version: number }>,
  notEditable: RuleCode,
): SaveAnswer {
  if (result.ok) return { kind: 'ok', version: result.data.version };
  const { error } = result;
  // The text itself is refused: the editor shows what to fix, and a retry would fail the same.
  if (error.code === 'invalid-input') return { kind: 'invalid' };
  if (error.code === 'conflict') return { kind: 'conflict' };
  if (error.code === 'unauthenticated') return { kind: 'unauthenticated' };
  if (error.code === 'not-found') return { kind: 'gone' };
  if (error.code === 'rate-limited') {
    return { kind: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error.code === 'rule' && error.rule === notEditable) return { kind: 'not-editable' };
  return { kind: 'failed' };
}

/** The same for the check after a conflict: the version and whether the editor may still save. */
export function statusAnswerOf(
  result: ActionResult<{ readonly version: number; readonly editable: boolean }>,
): StatusAnswer {
  if (result.ok)
    return { kind: 'ok', version: result.data.version, editable: result.data.editable };
  const { code } = result.error;
  if (code === 'unauthenticated') return { kind: 'unauthenticated' };
  return code === 'not-found' ? { kind: 'gone' } : { kind: 'failed' };
}
