import { defineUseCase, fail, ok } from '@/application/core';
import { saveFutureInput, saveFutureOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { futureEditNeedsReview } from '@/domain/review';

import { futureView, futureWriteAccess } from './access';
import { hasIssues, sameContent, submitIssues, withoutTimesOnMultiDay } from './checks';
import { move } from './events';

const notEditable = fail({ code: 'rule', rule: 'future-not-editable' });

/**
 * The author's autosave (design section 12, ADR 0017): the whole content
 * against the version the editor holds, unaudited under `author-autosave`,
 * for a draft or a returned item. An approved akce never autosaves: its
 * „Uložit změny“ sends `intent: 'revise'`, and that one save, when it changes
 * something, fires `revise`: the item goes back to review and the move is
 * audited, so it is checked as a submit is. Any other state, or a revise on
 * an item that is not approved, is the rule `future-not-editable`, as
 * `points.save` answers. A save that changes nothing writes nothing.
 */
export const saveFuture = defineUseCase({
  name: 'future.save',
  mode: 'write',
  input: saveFutureInput,
  output: saveFutureOutput,
  access: futureWriteAccess((item) => ({ action: 'future.view', item: futureView(item) })),
  async execute({ tx, actor, now }, { content, intent }, item) {
    // The policy also lets a reviewer edit what waits for review; that is the
    // audited review edit, never this save. The scoped load already gave a
    // pending or inactive account not-found.
    if (item.authorId !== actor.id) return fail({ code: 'forbidden' });
    const asAuthor = { isAuthor: true, state: item.state, kind: item.kind };
    if (!can(actor, { action: 'future.edit', item: asAuthor })) return notEditable;
    const revises = futureEditNeedsReview(item.state, {
      kind: 'user',
      role: actor.role,
      isAuthor: true,
    });
    if (revises !== (intent === 'revise')) return notEditable;

    if (revises) {
      // The editors hide the times of a multi-day item: a change that makes one multi-day drops them.
      const revisedContent = withoutTimesOnMultiDay(content);
      if (sameContent(item.content, revisedContent))
        return ok({ version: item.version, state: item.state });
      const fields = submitIssues(revisedContent);
      if (hasIssues(fields)) return fail({ code: 'invalid-input', fields });
      const revised = await move(tx, item, 'revise', {
        content: revisedContent,
        submittedAt: now,
      });
      return ok({ version: revised.version, state: revised.state });
    }

    const saved = await tx.futureItems.update(item.id, item.version, { content });
    tx.audit.exempt('author-autosave', { type: 'future_item', id: item.id });
    return ok({ version: saved.version, state: saved.state });
  },
});
