import { readAccess, writeAccess } from '@/application/core';
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

/** An item as `future.view` sees it: `submittedAt` is set at each submit and cleared by a retract. */
export const futureView = (item: FutureItemRecord) => ({
  authorId: item.authorId,
  state: item.state,
  kind: item.kind,
  everSubmitted: item.submittedAt !== null,
});

/**
 * The access of a read of one item: the scoped repository without the row lock,
 * so an item outside the reader's scope is not-found.
 */
export const futureReadAccess = <I extends { readonly id: string }>() =>
  readAccess<I, FutureItemRecord>(
    (tx, id) => tx.futureItems.get(id),
    (item): Check => ({
      action: 'future.view',
      item: futureView(item),
    }),
  );
