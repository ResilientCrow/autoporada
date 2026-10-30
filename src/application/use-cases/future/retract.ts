import { defineUseCase, ok } from '@/application/core';
import { retractFutureInput, retractFutureOutput } from '@/contracts';

import { futureWriteAccess } from './access';
import { move, moveCheck } from './events';

/**
 * „Stáhnout“ (design section 12): a submitted item back to the author's
 * drafts before anyone decided. `submitted_at` is cleared, so reviewers stop
 * seeing the item until the next submit.
 */
export const retractFuture = defineUseCase({
  name: 'future.retract',
  mode: 'write',
  input: retractFutureInput,
  output: retractFutureOutput,
  access: futureWriteAccess(moveCheck('retract')),
  async execute({ tx }, _input, item) {
    const after = await move(tx, item, 'retract', { submittedAt: null });
    return ok({ version: after.version });
  },
});
