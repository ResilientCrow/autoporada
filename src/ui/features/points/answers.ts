import type { z } from 'zod';

import type { ActionResult, pointStatusOutput, savePointOutput } from '@/contracts';
import type { SaveAnswer, StatusAnswer } from '@/ui/form';

/** What the autosave machine hears of a save: the server's answer in its own words. */
export function saveAnswer(result: ActionResult<z.output<typeof savePointOutput>>): SaveAnswer {
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
  if (error.code === 'rule' && error.rule === 'point-not-editable') return { kind: 'not-editable' };
  return { kind: 'failed' };
}

/** The same for the check after a conflict. */
export function statusAnswer(
  result: ActionResult<z.output<typeof pointStatusOutput>>,
): StatusAnswer {
  if (result.ok)
    return { kind: 'ok', version: result.data.version, editable: result.data.editable };
  const { code } = result.error;
  if (code === 'unauthenticated') return { kind: 'unauthenticated' };
  return code === 'not-found' ? { kind: 'gone' } : { kind: 'failed' };
}
