import { writeAccess } from '@/application/core';
import type { FutureItemRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';

/**
 * The access of a write to an item (ADR 0011): the item under its row lock
 * through the write scope (the author's own items), so one that is not theirs,
 * a colleague's approved akce included, is not-found; then the version, so a
 * stale page is a conflict whatever the state; then the use case's own check on
 * the locked row, which still names the author: a second line behind the scope.
 */
export const futureWriteAccess = <
  I extends { readonly id: string; readonly expectedVersion: number },
>(
  check: (item: FutureItemRecord, input: I) => Check,
) => writeAccess<I, FutureItemRecord>((tx, id) => tx.futureItems.loadForWrite(id), check);

/**
 * The access of a decision or a cancel (ADR 0011): the item under its row lock through the review
 * scope: the author's own items and, for a reviewer, the ones in review, so a draft or a colleague's
 * item for anyone else, a colleague's approved akce included, is not-found; then the version; then the
 * use case's own check, which holds the machine's rules (who decides, from which state).
 */
export const futureDecisionAccess = <
  I extends { readonly id: string; readonly expectedVersion: number },
>(
  check: (item: FutureItemRecord, input: I) => Check,
) => writeAccess<I, FutureItemRecord>((tx, id) => tx.futureItems.loadForDecision(id), check);

/** An item as `future.view` sees it: `submittedAt` is set at each submit and cleared by a retract. */
export const futureView = (item: FutureItemRecord) => ({
  authorId: item.authorId,
  state: item.state,
  kind: item.kind,
  everSubmitted: item.submittedAt !== null,
});
