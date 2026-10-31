import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { at } from './columns';

/**
 * The few things the headmaster can change without code (ADR 0032), one row per key; no row
 * means the key's default in code. No personal data and no `updated_by`: the audit event names
 * the actor. Every value is an object, which the CHECK `settings_value` holds. Migration 0029 attaches the `version_bump` trigger.
 */
export const settings = pgTable(
  'settings',
  {
    key: text().primaryKey(),
    value: jsonb().notNull(),
    version: integer().notNull().default(1),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    check('settings_key', sql`${t.key} ~ '^[a-z0-9.]{1,64}$'`),
    check('settings_value', sql`jsonb_typeof(${t.value}) = 'object'`),
    check('settings_size', sql`octet_length(${t.value}::text) <= 65536`),
  ],
);
