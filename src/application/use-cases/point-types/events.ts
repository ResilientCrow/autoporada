import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, PointTypeRecord, PointTypeValues } from '@/application/ports';

/**
 * What the diff of a point type shows: the settings that are not text the headmaster wrote. The
 * name and the bullets are text, so `omit`: the event says that they changed (`changedFields`)
 * and which bullets (by position, a key being a slug of the label), never what they say (ADR 0015;
 * `test/arch/audit-meta.test.ts`).
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

/**
 * Which bullets changed, by position, never by key (a key is a slug of the label the headmaster
 * typed): the 1-based positions in the new list of the bullets added or changed, and how many
 * bullets of the old list are gone.
 */
function bulletChanges(
  before: PointTypeValues | null,
  after: PointTypeValues,
): { changed: number[]; removed: number } {
  const was = new Map(bulletsOf(before).map((b) => [b.key, canonical(b)]));
  const now = bulletsOf(after);
  const kept = new Set(now.map((b) => b.key));
  return {
    changed: now.flatMap((b, i) => (was.get(b.key) === canonical(b) ? [] : [i + 1])),
    removed: [...was.keys()].filter((key) => !kept.has(key)).length,
  };
}

/** A point type the headmaster deleted: the settings it had, never its name or bullets. */
export function pointTypeDeletedEvent(before: PointTypeRecord): AuditEvent {
  return {
    action: 'point_type.deleted',
    target: { type: 'point_type', id: before.id },
    diff: diffRecords(POINT_TYPE_AUDIT, before, null),
  };
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
      bullets: bulletChanges(before, after),
    },
  };
}
