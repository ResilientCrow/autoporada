import { defineUseCase, fail, ok } from '@/application/core';
import { submitFutureInput, submitFutureOutput } from '@/contracts';
import { FUTURE_CAP } from '@/domain/report';

import { futureWriteAccess } from './access';
import { hasIssues, submitIssues } from './checks';
import { move, moveCheck } from './events';

/**
 * „Odeslat ke kontrole“ (design section 12): the content the editor holds
 * is checked for what a handed-in item must hold, then stored as the item
 * moves to submitted. A refusal writes nothing. An author has at most FUTURE_CAP
 * items at submitted; `beginSubmit` counts them under the author's lock, so two
 * submits at once cannot both take the last place. A returned item does not
 * count, but sending it again needs a free place.
 */
export const submitFuture = defineUseCase({
  name: 'future.submit',
  mode: 'write',
  input: submitFutureInput,
  output: submitFutureOutput,
  access: futureWriteAccess(moveCheck('submit')),
  async execute({ tx, now }, { content }, item) {
    const fields = submitIssues(content);
    if (hasIssues(fields)) return fail({ code: 'invalid-input', fields });
    const { pending } = await tx.futureItems.beginSubmit();
    if (pending >= FUTURE_CAP) return fail({ code: 'rule', rule: 'future-pending-cap' });
    const after = await move(tx, item, 'submit', { content, submittedAt: now });
    return ok({ version: after.version });
  },
});
