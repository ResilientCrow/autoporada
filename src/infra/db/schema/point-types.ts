import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';

import type { BulletSpec } from '@/domain/report';

import { at, createdAt, id } from './columns';

/** The values of `TitleGender` (domain/cs); point-types.test.ts holds the two together. */
export const titleGender = pgEnum('title_gender', ['m', 'f', 'n', 'pl', 'npl']);

/**
 * What a report is about („Seminář“, „Exkurze“), with the bullets a new draft
 * starts with. Not personal data. `locked` marks the type that must stay on
 * offer („Jiné“); migration 0014 seeds the placeholders and lets `version`
 * rise only by one per update.
 */
export const pointTypes = pgTable(
  'point_types',
  {
    id: id(),
    name: text().notNull(),
    /** Null until an admin chooses one by sample; the opening then assumes feminine. */
    titleGender: titleGender(),
    defaultBullets: jsonb().$type<BulletSpec[]>().notNull(),
    active: boolean().notNull().default(true),
    locked: boolean().notNull().default(false),
    position: integer().notNull(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    unique('point_types_name_key').on(t.name),
    check('point_types_locked_active', sql`NOT ${t.locked} OR ${t.active}`),
    check(
      'point_types_bullets_array',
      sql`jsonb_typeof(${t.defaultBullets}) = 'array' AND jsonb_array_length(${t.defaultBullets}) <= 12`,
    ),
  ],
);
