import { defineUseCase, fail, ok } from '@/application/core';
import { submitFutureInput, submitFutureOutput } from '@/contracts';

import { futureWriteAccess } from './access';
import { hasIssues, submitIssues } from './checks';
import { move, moveCheck } from './events';

/**
 * „Odeslat ke kontrole“ (design section 12): the content the editor holds
 * is checked for what a handed-in item must hold, then stored as the item
 * moves to submitted. A refusal writes nothing.
 */
export const submitFuture = defineUseCase({
  name: 'future.submit',
  mode: 'write',
  input: submitFutureInput,
  output: submitFutureOutput,
  access: futureWriteAccess(moveCheck('submit')),
  async execute({ tx, now }, { content }, item) {
    const fields = submitIssues(item.kind, content);
    if (hasIssues(fields)) return fail({ code: 'invalid-input', fields });
    const after = await move(tx, item, 'submit', { content, submittedAt: now });
    return ok({ version: after.version });
  },
});
