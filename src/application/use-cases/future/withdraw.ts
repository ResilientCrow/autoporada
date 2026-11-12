import { defineUseCase, fail, ok } from '@/application/core';
import { withdrawFutureInput, withdrawFutureOutput } from '@/contracts';

import { futureWriteAccess } from './access';
import { move, moveCheck } from './events';

/**
 * „Smazat akci / schůzku“ in the wizard (ADR 0057): the author's draft, returned or submitted item,
 * gone for good, after a confirmation. An item once submitted stays readable to reviewers; a draft
 * never handed in has no submit time and stays the author's alone. An approved akce is cancelled
 * instead (`future.cancel`), never withdrawn.
 */
export const withdrawFuture = defineUseCase({
  name: 'future.withdraw',
  mode: 'write',
  input: withdrawFutureInput,
  output: withdrawFutureOutput,
  access: futureWriteAccess(moveCheck('withdraw')),
  async execute({ tx }, { confirmed }, item) {
    if (!confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const after = await move(tx, item, 'withdraw');
    return ok({ version: after.version });
  },
});
