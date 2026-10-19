import type { TransitionResult } from '@/domain/review';

import { fail, type Outcome } from './result';

/** A refused state-machine step as the failure the user sees. */
export function fromTransition(
  result: Extract<TransitionResult<string>, { ok: false }>,
  noteField = 'note',
): Outcome<never> {
  switch (result.reason) {
    case 'wrong-state':
      return fail({ code: 'conflict' });
    case 'not-allowed':
      return fail({ code: 'forbidden' });
    case 'note-required':
      return fail({ code: 'invalid-input', fields: { [noteField]: 'required' } });
  }
}
