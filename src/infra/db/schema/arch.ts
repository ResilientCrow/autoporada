import { sql } from 'drizzle-orm';
import { check, date, integer, jsonb, pgTable } from 'drizzle-orm/pg-core';

import { at } from './columns';

/**
 * Branch arch-ui only: the further annexes of one porada (tables, images, text), keyed by its
 * Monday. Images make them too big for `settings` (64 KiB), so they get a row of their own.
 */
export const archAnnexes = pgTable(
  'arch_annexes',
  {
    monday: date({ mode: 'string' }).primaryKey(),
    annexes: jsonb().notNull(),
    version: integer().notNull().default(1),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    check('arch_annexes_list', sql`jsonb_typeof(${t.annexes}) = 'array'`),
    check('arch_annexes_size', sql`octet_length(${t.annexes}::text) <= 4000000`),
  ],
);
