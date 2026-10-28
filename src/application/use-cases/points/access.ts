import type { ResourceAccess } from '@/application/core';
import type { PointRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';
import { authorEditsPoint } from '@/domain/review';

/** What every write to a point names: the point and the version the page showed. */
interface PointWrite {
  readonly id: string;
  readonly expectedVersion: number;
}

/**
 * The access of a write to a point (ADR 0011): the point under its row lock
 * through the scoped repository, so a point the user may not see is
 * not-found; then the version, so a stale page is a conflict whatever the
 * point's state; then the use case's own check on the locked row.
 */
export function pointWriteAccess<I extends PointWrite>(
  check: (point: PointRecord, input: I) => Check,
): ResourceAccess<I, PointRecord> {
  return {
    kind: 'resource',
    load: (tx, input) => tx.points.loadForWrite(input.id),
    expectedVersion: (input) => input.expectedVersion,
    check,
  };
}

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
export function pointReadAccess<I extends { readonly id: string }>(): ResourceAccess<
  I,
  PointRecord
> {
  return {
    kind: 'resource',
    load: (tx, { id }) => tx.points.get(id),
    expectedVersion: 'unversioned',
    check: (point) => ({ action: 'point.view', point: pointView(point) }),
  };
}

/**
 * Where the point stands for the reader. `editable` is the save's rule: the
 * author, while the point is theirs to change; a reviewer's edit is another path.
 */
export const pointStanding = (point: PointRecord, readerId: string) => ({
  version: point.version,
  state: point.state,
  editable: point.authorId === readerId && authorEditsPoint(point.state),
});
