import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, PointRecord } from '@/application/ports';
import { toIsoDate } from '@/domain/time';

/**
 * What the audit log shows of a point: its type and where it stands in
 * review, never what the author wrote. The kind never changes, so it goes in
 * `meta`; the author is the event's actor.
 */
const POINT: AuditShape<PointRecord> = {
  id: 'omit',
  kind: 'omit',
  authorId: 'omit',
  typeId: 'value',
  state: 'value',
  content: 'omit',
  futureItemId: 'omit',
  earliestMonday: (monday) => monday && toIsoDate(monday),
  submittedAt: 'value',
  handInMonday: (monday) => monday && toIsoDate(monday),
  version: 'omit',
  updatedAt: 'omit',
};

/** A point created or moved (past tense, as every M8 action). */
export function pointEvent(
  action: `point.${string}`,
  before: PointRecord | null,
  after: PointRecord,
): AuditEvent {
  return {
    action,
    target: { type: 'point', id: after.id },
    diff: diffRecords(POINT, before, after),
    meta: { kind: after.kind },
  };
}
