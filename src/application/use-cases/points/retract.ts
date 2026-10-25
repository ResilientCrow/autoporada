import { defineUseCase, ok } from '@/application/core';
import { retractPointInput, retractPointOutput } from '@/contracts';

import { move, moveCheck } from './append-event';
import { pointWriteAccess } from './load-for-write';

/**
 * „Stáhnout“ (design section 9): a submitted point back to the author's
 * drafts before anyone decided. It is not held to the draft cap: an author
 * can always take a point back. `submitted_at` stays, so the point still
 * counts as ever submitted; as a draft it is the author's alone again.
 */
export const retractPoint = defineUseCase({
  name: 'points.retract',
  mode: 'write',
  input: retractPointInput,
  output: retractPointOutput,
  access: pointWriteAccess(moveCheck('retract')),
  async execute({ tx }, _input, point) {
    const after = await move(tx, point, 'retract');
    return ok({ version: after.version });
  },
});
