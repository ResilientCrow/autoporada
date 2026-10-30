import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, PointTypeRecord, PointTypeValues } from '@/application/ports';

/**
 * What the diff of a point type shows: the settings that are not text the headmaster wrote. The
 * name and the bullets are text, so `omit`: the event says that they changed (`changedFields`)
 * and which bullets (by key), never what they say (ADR 0015; `test/arch/audit-meta.test.ts`).
 */
const POINT_TYPE_AUDIT: AuditShape<PointTypeRecord> = {
  id: 'omit',
  name: 'omit',
  titleGender: 'value',
  defaultBullets: 'omit',
  active: 'value',
  locked: 'omit',
  position: 'value',
  version: 'omit',
};

/** The fields of a type the admin sets, in the order the audit lists them. */
const FIELDS = ['name', 'titleGender', 'defaultBullets', 'active', 'position'] as const;
export type PointTypeField = (typeof FIELDS)[number];

const bulletsOf = (type: PointTypeValues | null) => type?.defaultBullets ?? [];

/** A bullet as stored, with no role as `null`, so that two equal bullets read as equal. */
const canonical = (bullet: PointTypeValues['defaultBullets'][number]) =>
  JSON.stringify({ ...bullet, role: bullet.role ?? null });

/** The fields in which `after` differs from `before` (`null`: a new type, which sets them all). */
export function changedFields(
  before: PointTypeValues | null,
  after: PointTypeValues,
): readonly PointTypeField[] {
  return FIELDS.filter((field) => {
    if (before === null) return true;
    if (field === 'defaultBullets') {
      return (
        JSON.stringify(before.defaultBullets.map(canonical)) !==
        JSON.stringify(after.defaultBullets.map(canonical))
      );
    }
    return before[field] !== after[field];
  });
}

/** The keys of the bullets that were added, removed or changed, in the new order first. */
function changedBulletKeys(before: PointTypeValues | null, after: PointTypeValues): string[] {
  const was = new Map(bulletsOf(before).map((b) => [b.key, canonical(b)]));
  const now = new Map(bulletsOf(after).map((b) => [b.key, canonical(b)]));
  return [
    ...[...now].filter(([key, bullet]) => was.get(key) !== bullet).map(([key]) => key),
    ...[...was.keys()].filter((key) => !now.has(key)),
  ];
}

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
    meta: {
      fields: [...changedFields(before, after)],
      bullets: changedBulletKeys(before, after),
    },
  };
}
