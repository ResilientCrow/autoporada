import { readAccess, writeAccess } from '@/application/core';
import type { PointRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';
import { authorEditsPoint } from '@/domain/review';

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

/**
 * The access of a read of one point: the scoped repository without the row
 * lock, so a point outside the reader's scope is not-found (a colleague's
 * draft, a retracted point, any point for a pending or inactive account).
 */
export const pointReadAccess = <I extends { readonly id: string }>() =>
  readAccess<I, PointRecord>(
    (tx, id) => tx.points.get(id),
    (point) => ({
      action: 'point.view',
      point: pointView(point),
    }),
  );

/**
 * Where the point stands for the reader. `editable` is the save's rule: the
 * author, while the point is theirs to change; a reviewer's edit is another path.
 */
export const pointStanding = (point: PointRecord, readerId: string) => ({
  version: point.version,
  state: point.state,
  editable: point.authorId === readerId && authorEditsPoint(point.state),
});
