import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, PointTypeRecord } from '@/application/ports';

/** What the audit log shows of a point type: the admin's settings, not its id or version. */
export const POINT_TYPE_AUDIT: AuditShape<PointTypeRecord> = {
  id: 'omit',
  name: 'value',
  titleGender: 'value',
  defaultBullets: (bullets) => bullets.map((b) => ({ ...b, role: b.role ?? null })),
  active: 'value',
  locked: 'omit',
  position: 'value',
  version: 'omit',
};

/** A point type made or changed by the headmaster (past tense, as every M8 action). */
export function pointTypeEvent(
  action: 'point_type.created' | 'point_type.changed',
  before: PointTypeRecord | null,
  after: PointTypeRecord,
): AuditEvent {
  return {
    action,
    target: { type: 'point_type', id: after.id },
    diff: diffRecords(POINT_TYPE_AUDIT, before, after),
  };
}
