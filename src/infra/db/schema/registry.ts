import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { at, createdAt, id } from './columns';
import { issues } from './issues';

export const registryPurpose = pgEnum('registry_purpose', ['annex1', 'point4']);

/**
 * A list of students the document prints: Příloha 1 (`annex1`, exactly one) and the lists of
 * point 4 (ADR 0033). Not personal data itself; migration 0032 seeds the four lists the template
 * has and attaches the `version_bump` trigger.
 */
export const registryLists = pgTable(
  'registry_lists',
  {
    id: id(),
    key: text().notNull(),
    title: text().notNull(),
    docLabel: text().notNull(),
    purpose: registryPurpose().notNull(),
    position: smallint().notNull(),
    active: boolean().notNull().default(true),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    unique('registry_lists_key_key').on(t.key),
    unique('registry_lists_title_key').on(t.title),
    uniqueIndex('registry_lists_one_annex1')
      .on(t.purpose)
      .where(sql`${t.purpose} = 'annex1'`),
    check('registry_lists_key', sql`${t.key} ~ '^[a-z0-9-]{1,40}$'`),
    check(
      'registry_lists_lengths',
      sql`char_length(${t.title}) BETWEEN 1 AND 120 AND char_length(${t.docLabel}) BETWEEN 1 AND 300`,
    ),
    check('registry_lists_annex1_active', sql`${t.purpose} <> 'annex1' OR ${t.active}`),
  ],
);

/**
 * One student on a list: names and class, no person id (ADR 0033). Personal data of minors.
 * `removed_at` marks a removed or archived entry that was printed; one never printed is deleted.
 */
export const registryEntries = pgTable(
  'registry_entries',
  {
    id: id(),
    listId: uuid()
      .notNull()
      .references(() => registryLists.id, { onDelete: 'restrict' }),
    givenName: text().notNull(),
    familyName: text().notNull(),
    classCode: text().notNull(),
    addedAt: at().notNull().defaultNow(),
    removedAt: at(),
    archivedYear: text(),
    /** Stamped by M10 when a generated issue lists the entry for the first time. */
    firstPublishedIssueId: uuid().references(() => issues.id),
    version: integer().notNull().default(1),
  },
  (t) => [
    uniqueIndex('registry_entries_active_key')
      .on(t.listId, t.familyName, t.givenName, t.classCode)
      .where(sql`${t.removedAt} IS NULL`),
    index('registry_entries_list_idx')
      .on(t.listId)
      .where(sql`${t.removedAt} IS NULL`),
    check(
      'registry_entries_lengths',
      sql`char_length(${t.givenName}) BETWEEN 1 AND 60 AND char_length(${t.familyName}) BETWEEN 1 AND 60 AND char_length(${t.classCode}) BETWEEN 1 AND 8`,
    ),
    check(
      'registry_entries_archived',
      sql`${t.archivedYear} IS NULL OR (${t.removedAt} IS NOT NULL AND ${t.archivedYear} ~ '^[0-9]{4}/[0-9]{4}$')`,
    ),
  ],
);
