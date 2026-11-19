import { defineUseCase, fail, ok } from '@/application/core';
import { saveFutureInput, saveFutureOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { futureEditNeedsReview } from '@/domain/review';

import { futureView, futureWriteAccess } from './access';
import { hasIssues, kindIssues, sameContent, submitIssues, withoutTimesOnMultiDay } from './checks';
import { move } from './events';

const notEditable = fail({ code: 'rule', rule: 'future-not-editable' });

/**
 * The author's autosave (design section 12, ADR 0017): the whole content
 * against the version the editor holds, unaudited under `author-autosave`,
 * for a draft or a returned item. An approved akce never autosaves: its
 * „Uložit změny“ sends `intent: 'revise'`, and that one save, when it changes
 * something, fires `revise`: the item goes back to review and the move is
 * audited, so it is checked as a submit is. Any other state, or a revise on
 * an item that is not approved or whose cancel request waits (ADR 0062), is
 * the rule `future-not-editable`, as `points.save` answers. A save that
 * changes nothing writes nothing.
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
    // While the author's cancel waits for the vedení, the approved item is not theirs to change.
    const asAuthor = {
      isAuthor: true,
      state: item.state,
      kind: item.kind,
      cancelRequested: item.cancelRequestedAt !== null,
    };
    if (!can(actor, { action: 'future.edit', item: asAuthor })) return notEditable;
    const revises = futureEditNeedsReview(item.state, {
      kind: 'user',
      role: actor.role,
      isAuthor: true,
    });
    if (revises !== (intent === 'revise')) return notEditable;

    // The editors hide the times of a multi-day item: a change that makes one multi-day drops them.
    const stored = withoutTimesOnMultiDay(content);
    // A draft saves anything, but a jednání never takes an address (ADR 0071).
    const kindFields = kindIssues(stored, item.kind);
    if (hasIssues(kindFields)) return fail({ code: 'invalid-input', fields: kindFields });
    if (revises) {
      if (sameContent(item.content, stored))
        return ok({ version: item.version, state: item.state });
      const fields = submitIssues(stored, item.kind, item.content);
      if (hasIssues(fields)) return fail({ code: 'invalid-input', fields });
      const revised = await move(tx, item, 'revise', { content: stored, submittedAt: now });
      return ok({ version: revised.version, state: revised.state });
    }

    const saved = await tx.futureItems.update(item.id, item.version, { content: stored });
    tx.audit.exempt('author-autosave', { type: 'future_item', id: item.id });
    return ok({ version: saved.version, state: saved.state });
  },
});
