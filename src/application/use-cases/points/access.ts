import { writeAccess } from '@/application/core';
import type { PointRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';

/**
 * The access of a write to a point (ADR 0011): the point under its row lock
 * through the scoped repository, so a point the user may not see is
 * not-found; then the version, so a stale page is a conflict whatever the
 * point's state; then the use case's own check on the locked row.
 */
export const pointWriteAccess = <
  I extends { readonly id: string; readonly expectedVersion: number },
>(
  check: (point: PointRecord, input: I) => Check,
) => writeAccess<I, PointRecord>((tx, id) => tx.points.loadForWrite(id), check);

/** A point as `point.view` sees it: `submittedAt` is set at each submit and cleared by a retract. */
export const pointView = (point: PointRecord) => ({
  authorId: point.authorId,
  state: point.state,
  everSubmitted: point.submittedAt !== null,
});
