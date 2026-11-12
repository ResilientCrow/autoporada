import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import type { FutureEventName } from '@/application/ports';
import type { Campus } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import { MAX_RETURN_PARTS, type FutureState, type ReportState } from '@/domain/review';

import { at, atMs, createdAt, id } from './columns';
import { users } from './identity';
import { points } from './points';

/** The values of `FutureKind` (domain/calendar); future.test.ts holds the two together. */
export const futureKind = pgEnum('future_kind', ['jednani', 'akce']);
/** The values of `FutureState` (domain/review); future.test.ts holds the two together. */
export const futureState = pgEnum('future_state', [
  'draft',
  'submitted',
  'returned',
  'approved',
  'rejected',
  'withdrawn',
  'cancelled',
]);
/** The values of `ReportState` (domain/review); `prompted` is never stored (design §2). */
export const reportState = pgEnum('report_state', ['none', 'prompted', 'written', 'missed']);

const CAMPUSES = ['smichov', 'radlice', 'na-vidouli', 'jinde'] as const satisfies readonly Campus[];
const campusList = sql.raw(CAMPUSES.map((campus) => `'${campus}'`).join(','));

/**
 * A jednání or an akce that can appear in a coming issue (design §2, §12). It
 * holds what its author wrote, so it is personal data. The CHECKs back up Zod
 * and the use cases; none is a known constraint. The future migration
 * (0020) lets `version` rise only by one per update and gives `points` its
 * `future_item_id` foreign key.
 */
export const futureItems = pgTable(
  'future_items',
  {
    id: id(),
    kind: futureKind().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    /** The draft's id in the author's browser: a retried create finds the row it made. */
    clientRef: uuid().notNull(),
    state: futureState().notNull().default('draft'),
    title: text().notNull().default(''),
    startDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    timeFrom: time(),
    timeTo: time(),
    campus: text().$type<Campus>(),
    place: text(),
    /** Free text printed as typed (ADR 0060). */
    organizer: text(),
    participants: text(),
    note: text(),
    reportState: reportState().$type<ReportState>().notNull().default('none'),
    /** The report written for this akce; the point's `future_item_id` points back. */
    reportPointId: uuid().references(() => points.id),
    /** Set at every submit, cleared by a retract. */
    submittedAt: at(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: atMs().notNull().defaultNow(),
  },
  (t) => [
    unique('future_items_author_client_ref_key').on(t.authorId, t.clientRef),
    index('future_items_author_idx').on(t.authorId, t.updatedAt.desc()),
    index('future_items_state_idx').on(t.state, t.startDate),
    /** Every approved akce owes a report after its last day, and only an akce (ADR 0048). */
    check('future_items_report_akce', sql`${t.reportState} = 'none' OR ${t.kind} = 'akce'`),
    check(
      'future_items_dates',
      sql`${t.endDate} IS NULL OR (${t.startDate} IS NOT NULL AND ${t.endDate} >= ${t.startDate})`,
    ),
    check('future_items_campus', sql`${t.campus} IS NULL OR ${t.campus} IN (${campusList})`),
    check(
      'future_items_lengths',
      sql`char_length(${t.title}) <= 200 AND char_length(coalesce(${t.place}, '')) <= 120
        AND char_length(coalesce(${t.organizer}, '')) <= ${sql.raw(String(POINT_LIMITS.organizer))}
        AND char_length(coalesce(${t.participants}, '')) <= ${sql.raw(String(POINT_LIMITS.participants))}
        AND char_length(coalesce(${t.note}, '')) <= ${sql.raw(String(POINT_LIMITS.futureNote))}`,
    ),
    check(
      'future_items_submitted_complete',
      sql`${t.state} NOT IN ('submitted','approved','cancelled')
        OR (${t.title} <> '' AND ${t.startDate} IS NOT NULL AND ${t.submittedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * What happened to a future item and who did it, append-only (migration 0020).
 * Deleting an item deletes its events.
 */
export const futureEvents = pgTable(
  'future_events',
  {
    id: id(),
    futureItemId: uuid()
      .notNull()
      .references(() => futureItems.id, { onDelete: 'cascade' }),
    /** Null for a system event. */
    actorId: uuid().references(() => users.id),
    /** A transition of FUTURE_MACHINE, or 'edit' for a reviewer's edit. */
    event: text().$type<FutureEventName>().notNull(),
    fromState: futureState().$type<FutureState>().notNull(),
    toState: futureState().$type<FutureState>().notNull(),
    note: text(),
    /** A return: the parts of the item to rework (FUTURE_RETURN_PARTS), at most four. */
    returnParts: text().array(),
    /** A reviewer's edit: the names of the fields it changed. */
    editedFields: text().array(),
    createdAt: createdAt(),
  },
  (t) => [
    index('future_events_item_idx').on(t.futureItemId, t.createdAt),
    check(
      'future_events_note',
      sql`${t.note} IS NULL OR char_length(${t.note}) BETWEEN 1 AND 2000`,
    ),
    check(
      'future_events_note_required',
      sql`${t.event} NOT IN ('return','reject') OR ${t.note} IS NOT NULL OR (${t.event} = 'return' AND ${t.returnParts} IS NOT NULL)`,
    ),
    check(
      'future_events_return_parts',
      sql`${t.returnParts} IS NULL OR (${t.event} = 'return' AND cardinality(${t.returnParts}) BETWEEN 1 AND ${sql.raw(String(MAX_RETURN_PARTS))})`,
    ),
  ],
);

/**
 * The headmaster's replacement for the paragraph a missing report prints (ADR 0049), one row per
 * akce so it follows the akce across a skip or a move. No row means the paragraph the system
 * writes. Plain text people wrote, so it is never logged or audited; the worker has no grant on
 * it. Migration 0048 attaches the `version_bump` trigger.
 */
export const reportPlaceholders = pgTable(
  'report_placeholders',
  {
    futureItemId: uuid()
      .primaryKey()
      .references(() => futureItems.id, { onDelete: 'cascade' }),
    paragraph: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    check(
      'report_placeholders_paragraph',
      sql`char_length(${t.paragraph}) BETWEEN 1 AND ${sql.raw(String(POINT_LIMITS.opening))}`,
    ),
  ],
);
