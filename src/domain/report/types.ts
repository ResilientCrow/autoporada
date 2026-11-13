import type { TitleGender } from '@/domain/cs';

import type { BulletSpec } from './content';

/** The keys of the report types, in the order the chooser offers them (ADR 0064). */
export const POINT_TYPE_IDS = [
  'seminar',
  'exkurze',
  'soutez',
  'prednaska',
  'projektovy',
  'jine',
] as const;
export type PointTypeId = (typeof POINT_TYPE_IDS)[number];

/** What a report is about („Seminář“), with the bullets a new draft starts with. */
export interface PointType {
  readonly id: PointTypeId;
  readonly name: string;
  /** The gender of the type's noun in the opening sentence; null says „akce „…““ (Jiné). */
  readonly titleGender: TitleGender | null;
  /** Bullet keys are stable slugs: drafts copy them, so a key is never renamed. */
  readonly defaultBullets: readonly BulletSpec[];
}

const organisers = (required: boolean): BulletSpec => ({
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  required,
  role: 'organisers',
});
const participants = (required: boolean): BulletSpec => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  required,
});

/**
 * The report types, fixed in code (ADR 0064): the ones migrations 0014 and 0040 seeded. Changing a
 * type is a code change; renaming a key or removing a type also needs a migration of
 * `points.type_id`, whose CHECK lists these keys.
 */
export const POINT_TYPES: readonly PointType[] = [
  {
    id: 'seminar',
    name: 'Seminář',
    titleGender: 'm',
    defaultBullets: [organisers(true), participants(true)],
  },
  {
    id: 'exkurze',
    name: 'Exkurze',
    titleGender: 'f',
    defaultBullets: [organisers(false), participants(true)],
  },
  {
    id: 'soutez',
    name: 'Soutěž',
    titleGender: 'f',
    defaultBullets: [
      organisers(false),
      participants(false),
      { key: 'results', label: 'Výsledky', kind: 'text', required: false },
    ],
  },
  {
    id: 'prednaska',
    name: 'Přednáška',
    titleGender: 'f',
    defaultBullets: [
      {
        key: 'speakers',
        label: 'Přednášející',
        kind: 'people',
        required: false,
        role: 'organisers',
      },
      { key: 'audience', label: 'Posluchači', kind: 'text', required: false },
    ],
  },
  {
    id: 'projektovy',
    name: 'Projektový den',
    titleGender: 'm',
    defaultBullets: [organisers(false), participants(false)],
  },
  {
    id: 'jine',
    name: 'Jiné',
    titleGender: null,
    defaultBullets: [organisers(false), participants(true)],
  },
];

const BY_ID = new Map(POINT_TYPES.map((type) => [type.id, type]));

export const isPointTypeId = (value: unknown): value is PointTypeId =>
  typeof value === 'string' && BY_ID.has(value as PointTypeId);

/** The type of the key; the key's type guarantees there is one. */
export function pointType(id: PointTypeId): PointType {
  const type = BY_ID.get(id);
  if (!type) throw new Error(`unknown point type ${id}`);
  return type;
}
