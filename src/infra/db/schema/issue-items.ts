import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Statement } from '@/domain/outline';
import type { RichDoc } from '@/domain/richtext';

import { createdAt, id } from './columns';
import { issues } from './issues';
import { points } from './points';

export const issueSection = pgEnum('issue_section', ['pokyny', 'hospodareni']);
export const issueSlot = pgEnum('issue_slot', [
  'meetings',
  'events',
  'talent',
  'exemptions',
  'media',
  'partners',
]);
export const itemPersistence = pgEnum('item_persistence', ['standing', 'once']);

/**
 * The outline of one issue: the items of POKYNY and HOSPODAŘENÍ in order (design §2). A write
 * replaces all rows of the issue under `issues.version`, so rows carry no version and a new id
 * each time. Body shape and the section a proposal belongs to are checked by Zod and
 * `domain/outline`. The point foreign key cascades: a purged point takes its placement rows along.
 */
export const issueItems = pgTable(
  'issue_items',
  {
    id: id(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'restrict' }),
    section: issueSection().notNull(),
    position: smallint().notNull(),
    /** Names the item across issues; a placement row uses its point id. */
    lineageId: uuid().notNull(),
    slot: issueSlot(),
    persistence: itemPersistence().notNull(),
    /** Null on a placement row: title and body are the point's. */
    title: text(),
    body: jsonb().$type<RichDoc>(),
    quotes: jsonb()
      .$type<Statement[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourcePointId: uuid().references(() => points.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('issue_items_lineage_key').on(t.issueId, t.lineageId),
    unique('issue_items_position_key').on(t.issueId, t.section, t.position),
    uniqueIndex('issue_items_slot_key')
      .on(t.issueId, t.slot)
      .where(sql`${t.slot} IS NOT NULL`),
    uniqueIndex('issue_items_source_key')
      .on(t.issueId, t.sourcePointId)
      .where(sql`${t.sourcePointId} IS NOT NULL`),
    check('issue_items_position', sql`${t.position} BETWEEN 0 AND 59`),
    check(
      'issue_items_kind',
      sql`(${t.sourcePointId} IS NULL) = (${t.title} IS NOT NULL AND ${t.body} IS NOT NULL)`,
    ),
    check(
      'issue_items_source',
      sql`${t.sourcePointId} IS NULL OR (${t.slot} IS NULL AND ${t.persistence} = 'once' AND ${t.lineageId} = ${t.sourcePointId})`,
    ),
    check(
      'issue_items_slot',
      sql`${t.slot} IS NULL OR (${t.section} = 'pokyny' AND ${t.persistence} = 'standing')`,
    ),
    // coalesce: a NULL slot must not let quotes through (NULL OR false passes a CHECK)
    check(
      'issue_items_quotes',
      sql`(coalesce(${t.slot} = 'partners', false) OR ${t.quotes} = '[]'::jsonb) AND jsonb_array_length(${t.quotes}) <= 20`,
    ),
    check(
      'issue_items_title',
      sql`${t.title} IS NULL OR char_length(${t.title}) BETWEEN 1 AND 300`,
    ),
    check(
      'issue_items_size',
      sql`octet_length(coalesce(${t.body}::text,'')) + octet_length(${t.quotes}::text) <= 131072`,
    ),
  ],
);
