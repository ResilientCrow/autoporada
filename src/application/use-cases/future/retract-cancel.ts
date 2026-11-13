import { defineUseCase, ok } from '@/application/core';
import { retractCancelFutureInput, retractCancelFutureOutput } from '@/contracts';

import { futureWriteAccess } from './access';
import { cancelRequestMove, moveCheck } from './events';

/**
 * „Vzít žádost zpět“ (ADR 0062): the author takes back their cancel request before the vedení
 * decides; the item stands approved as before and leaves the review queue.
 */
export const retractCancelFuture = defineUseCase({
  name: 'future.retractCancel',
  mode: 'write',
  input: retractCancelFutureInput,
  output: retractCancelFutureOutput,
  access: futureWriteAccess(moveCheck('retract-cancel')),
  async execute({ tx }, _input, item) {
    const after = await cancelRequestMove(tx, item, 'retract-cancel', null);
    return ok({ version: after.version });
  },
});
