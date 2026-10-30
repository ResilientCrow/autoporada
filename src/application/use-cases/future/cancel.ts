import { defineUseCase, fail, ok } from '@/application/core';
import { cancelFutureInput, cancelFutureOutput } from '@/contracts';

import { futureDecisionAccess } from './access';
import { decideMove, moveCheck } from './events';

/**
 * „Zrušit akci“ (design section 12): an approved akce, called off. The author or a reviewer may;
 * the checkbox must be ticked, and nothing is written without it. Afterwards only the author and
 * reviewers see the item, so the colleagues' list drops it.
 */
export const cancelFuture = defineUseCase({
  name: 'future.cancel',
  mode: 'write',
  input: cancelFutureInput,
  output: cancelFutureOutput,
  access: futureDecisionAccess(moveCheck('cancel')),
  async execute({ tx }, { confirmed }, item) {
    if (!confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const after = await decideMove(tx, item, 'cancel');
    return ok({ version: after.version });
  },
});
