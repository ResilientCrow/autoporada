import { defineUseCase, ok } from '@/application/core';
import { retractPointInput, retractPointOutput } from '@/contracts';

import { pointWriteAccess } from './access';
import { move, moveCheck } from './append-event';

/**
 * „Stáhnout“ (design section 9): a submitted point back to the author's
 * drafts before anyone decided. It is not held to the draft cap: an author
 * can always take a point back. `submitted_at` is cleared, so the point no
 * longer counts as handed in: as a draft, and if the author then withdraws
 * it, it is the author's alone again (reviewers never see a draft rewritten
 * after the retract). `earliest_monday` stays, and the next submit sets
 * `submitted_at` again.
 */
export const retractPoint = defineUseCase({
  name: 'points.retract',
  mode: 'write',
  input: retractPointInput,
  output: retractPointOutput,
  access: pointWriteAccess(moveCheck('retract')),
  async execute({ tx }, _input, point) {
    const { after } = await move(tx, point, 'retract', { patch: { submittedAt: null } });
    return ok({ version: after.version });
  },
});
