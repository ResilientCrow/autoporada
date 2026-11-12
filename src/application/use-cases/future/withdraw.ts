import { defineUseCase, fail, ok } from '@/application/core';
import { withdrawFutureInput, withdrawFutureOutput } from '@/contracts';
import { wasApproved } from '@/domain/review';

import { futureWriteAccess } from './access';
import { move, moveCheck } from './events';

/**
 * „Smazat akci / schůzku“ in the wizard (ADR 0057): the author's draft, returned or submitted item,
 * gone for good, after a confirmation. An item once submitted stays readable to reviewers; a draft
 * never handed in has no submit time and stays the author's alone. An akce approved once, back in
 * review after a revise or a return, still owes its report: it is cancelled (`future.cancel`), never
 * withdrawn, so it is `forbidden` as an approved one is.
 */
export const withdrawFuture = defineUseCase({
  name: 'future.withdraw',
  mode: 'write',
  input: withdrawFutureInput,
  output: withdrawFutureOutput,
  access: futureWriteAccess(moveCheck('withdraw')),
  async execute({ tx }, { confirmed }, item) {
    if (wasApproved(await tx.futureEvents.list(item.id))) return fail({ code: 'forbidden' });
    if (!confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const after = await move(tx, item, 'withdraw');
    return ok({ version: after.version });
  },
});
