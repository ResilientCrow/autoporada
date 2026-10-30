import type { ResourceAccess } from '@/application/core';
import type { FutureItemRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';

/** What every write to an item names: the item and the version the page showed. */
interface FutureWrite {
  readonly id: string;
  readonly expectedVersion: number;
}

/**
 * The access of a write to an item (ADR 0011): the item under its row lock
 * through the scoped repository, so one the user may not see is not-found; then
 * the version, so a stale page is a conflict whatever the state; then the use
 * case's own check on the locked row. The scope also admits a colleague to an
 * approved akce, so every write goes through a check that names the author.
 */
export function futureWriteAccess<I extends FutureWrite>(
  check: (item: FutureItemRecord, input: I) => Check,
): ResourceAccess<I, FutureItemRecord> {
  return {
    kind: 'resource',
    load: (tx, input) => tx.futureItems.loadForWrite(input.id),
    expectedVersion: (input) => input.expectedVersion,
    check,
  };
}

/** An item as `future.view` sees it: `submittedAt` is set at each submit and cleared by a retract. */
const futureView = (item: FutureItemRecord) => ({
  authorId: item.authorId,
  state: item.state,
  kind: item.kind,
  everSubmitted: item.submittedAt !== null,
});

/**
 * The access of a read of one item: the scoped repository without the row lock,
 * so an item outside the reader's scope is not-found.
 */
export function futureReadAccess<I extends { readonly id: string }>(): ResourceAccess<
  I,
  FutureItemRecord
> {
  return {
    kind: 'resource',
    load: (tx, { id }) => tx.futureItems.get(id),
    expectedVersion: 'unversioned',
    check: (item) => ({ action: 'future.view', item: futureView(item) }),
  };
}
