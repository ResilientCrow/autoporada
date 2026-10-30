import { defineUseCase, fail, ok } from '@/application/core';
import { saveFutureInput, saveFutureOutput } from '@/contracts';
import { futureEditNeedsReview } from '@/domain/review';

import { futureWriteAccess } from './access';
import { hasIssues, kindIssues, sameContent, submitIssues } from './checks';
import { move } from './events';

/**
 * The author's autosave (design section 12, ADR 0017): the whole content
 * against the version the editor holds, unaudited under `author-autosave`.
 * An author's change to an approved item is not an autosave: it fires
 * `revise`, the item goes back to review, and the move is audited, so it is
 * checked as a submit is. A save that changes nothing writes nothing.
 */
export const saveFuture = defineUseCase({
  name: 'future.save',
  mode: 'write',
  input: saveFutureInput,
  output: saveFutureOutput,
  access: futureWriteAccess((item) => ({
    action: 'future.edit',
    item: { authorId: item.authorId, state: item.state, kind: item.kind },
  })),
  async execute({ tx, actor, now }, { content }, item) {
    // The policy also lets a reviewer edit what waits for review; that is the
    // audited review edit, never this save.
    if (item.authorId !== actor.id) return fail({ code: 'forbidden' });
    const shape = kindIssues(item.kind, content);
    if (hasIssues(shape)) return fail({ code: 'invalid-input', fields: shape });

    if (futureEditNeedsReview(item.state, { kind: 'user', role: actor.role, isAuthor: true })) {
      if (sameContent(item.content, content))
        return ok({ version: item.version, state: item.state });
      const fields = submitIssues(item.kind, content);
      if (hasIssues(fields)) return fail({ code: 'invalid-input', fields });
      const revised = await move(tx, item, 'revise', { content, submittedAt: now });
      return ok({ version: revised.version, state: revised.state });
    }

    const saved = await tx.futureItems.update(item.id, item.version, { content });
    tx.audit.exempt('author-autosave', { type: 'future_item', id: item.id });
    return ok({ version: saved.version, state: saved.state });
  },
});
