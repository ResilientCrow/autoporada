import { defineUseCase, ok } from '@/application/core';
import { refuseCancelFutureInput, refuseCancelFutureOutput } from '@/contracts';

import { futureDecisionAccess } from './access';
import { cancelRequestMove, moveCheck } from './events';

/**
 * „Zamítnout zrušení“ (ADR 0062): the vedení keeps an approved item whose author asked to cancel
 * it. The request is cleared and the item stays approved; the note, required, tells the author why
 * and goes into the history event only. The author reads it in the app: no mail is queued.
 */
export const refuseCancelFuture = defineUseCase({
  name: 'future.refuseCancel',
  mode: 'write',
  input: refuseCancelFutureInput,
  output: refuseCancelFutureOutput,
  access: futureDecisionAccess(moveCheck('refuse-cancel')),
  async execute({ tx }, { note }, item) {
    const after = await cancelRequestMove(tx, item, 'refuse-cancel', null, note);
    return ok({ version: after.version });
  },
});
