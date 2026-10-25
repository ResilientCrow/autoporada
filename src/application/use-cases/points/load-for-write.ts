import type { ResourceAccess } from '@/application/core';
import type { PointRecord } from '@/application/ports';
import type { Check } from '@/domain/policy';

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

/** A point as `point.view` sees it: `submittedAt` is never cleared, so it means "ever submitted". */
export const pointView = (point: PointRecord) => ({
  authorId: point.authorId,
  state: point.state,
  everSubmitted: point.submittedAt !== null,
});
