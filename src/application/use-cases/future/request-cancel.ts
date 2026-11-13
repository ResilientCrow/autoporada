import { defineUseCase, fail, ok } from '@/application/core';
import { requestCancelFutureInput, requestCancelFutureOutput } from '@/contracts';

import { futureWriteAccess } from './access';
import { cancelRequestMove, moveCheck } from './events';

/**
 * „Požádat o zrušení“ (ADR 0062): an author outside the vedení asks to cancel their approved akce or
 * jednání. The item stays approved: it is in the school overview, prints in its porada and owes its
 * report until the vedení confirms (`future.cancel`) or refuses (`future.refuseCancel`). The dialog's
 * yes must be ticked, and nothing is written without it.
 */
export const requestCancelFuture = defineUseCase({
  name: 'future.requestCancel',
  mode: 'write',
  input: requestCancelFutureInput,
  output: requestCancelFutureOutput,
  access: futureWriteAccess(moveCheck('request-cancel')),
  async execute({ tx, now }, { confirmed }, item) {
    if (!confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const after = await cancelRequestMove(tx, item, 'request-cancel', now);
    return ok({ version: after.version });
  },
});
