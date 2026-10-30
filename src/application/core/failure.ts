import type { KnownConstraint } from '@/application/ports';
import type { RuleCode } from '@/contracts';
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

/**
 * Constraints a concurrent change can trip at commit, as the rule the user
 * reads. Use cases check the rule first; this covers the race.
 */
export const CONSTRAINT_RULES: Readonly<Record<KnownConstraint, RuleCode>> = {
  users_active_headmaster: 'last-headmaster',
  users_student_role: 'student-role',
  access_requests_one_pending: 'request-pending',
  point_types_name_key: 'type-name-taken',
};
