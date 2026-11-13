import { defineUseCase, fail, ok } from '@/application/core';
import { cancelFutureInput, cancelFutureOutput } from '@/contracts';

import { futureDecisionAccess } from './access';
import { decideMove, moveCheck } from './events';

/**
 * „Zrušit akci“ (design section 12, ADR 0062): an approved akce, called off by the vedení, their own
 * included, at once or confirming the author's request („Potvrdit zrušení“), which the move clears.
 * An author outside the vedení asks instead (`future.requestCancel`). The checkbox must be ticked,
 * and nothing is written without it. Afterwards only the author and reviewers see the item, so the
 * colleagues' list drops it.
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
