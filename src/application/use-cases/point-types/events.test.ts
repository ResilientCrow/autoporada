import { describe, expect, it } from 'vitest';

import type { Json, PointTypeRecord } from '@/application/ports';

import { pointTypeEvent } from './events';

const bullet = (key: string, label: string, over: Record<string, unknown> = {}) =>
  ({
    key,
    label,
    kind: 'text',
    required: false,
    ...over,
  }) as PointTypeRecord['defaultBullets'][number];

const record = (bullets: PointTypeRecord['defaultBullets']): PointTypeRecord => ({
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Tajný název',
  titleGender: 'f',
  defaultBullets: bullets,
  active: true,
  locked: false,
  position: 1,
  version: 1,
});

const A = bullet('tajny-stitek-a--t', 'Tajný štítek A');
const B = bullet('tajny-stitek-b--t', 'Tajný štítek B');
const C = bullet('tajny-stitek-c--t', 'Tajný štítek C');

const metaOf = (before: PointTypeRecord | null, after: PointTypeRecord) =>
  pointTypeEvent(before ? 'point_type.changed' : 'point_type.created', before, after).meta;

/** Every string in a meta value, keys excluded. */
function strings(value: Json): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('the point type audit event', () => {
  it('names a created type by its fields and the positions of its bullets', () => {
    expect(metaOf(null, record([A, B]))).toEqual({
      fields: ['name', 'titleGender', 'defaultBullets', 'active', 'position'],
      bullets: { changed: [1, 2], removed: 0 },
    });
  });

  it('gives the 1-based positions in the new list of the bullets added or changed', () => {
    const before = record([A, B]);
    const after = record([A, bullet(B.key, 'Jiný štítek'), C]);
    expect(metaOf(before, after)).toMatchObject({ bullets: { changed: [2, 3], removed: 0 } });
  });

  it('counts the bullets that were removed, and reports a change of kind or role', () => {
    const before = record([A, B, C]);
    expect(metaOf(before, record([A]))).toMatchObject({ bullets: { changed: [], removed: 2 } });
    expect(
      metaOf(before, record([A, bullet(B.key, B.label, { required: true }), C])),
    ).toMatchObject({
      bullets: { changed: [2], removed: 0 },
    });
  });

  it('reports no bullet when only another field changed', () => {
    const before = record([A, B]);
    expect(metaOf(before, { ...before, active: false })).toEqual({
      fields: ['active'],
      bullets: { changed: [], removed: 0 },
    });
  });

  it('carries nothing derived from a label, a bullet key or the name', () => {
    const before = record([A, B]);
    const after = { ...record([bullet(C.key, 'Zcela nový štítek'), B]), name: 'Jiný název' };
    const meta = metaOf(before, after);
    expect(JSON.stringify(meta)).not.toMatch(/tajn|stitek|štítek|nový|název|--t/i);
    // The only strings in the meta are the field names the admin sets.
    const known = new Set(['name', 'titleGender', 'defaultBullets', 'active', 'position']);
    for (const value of strings(meta as Json)) expect(known.has(value)).toBe(true);
    // And the bullets part holds numbers only.
    expect(strings(meta?.['bullets'] as Json)).toEqual([]);
  });
});
