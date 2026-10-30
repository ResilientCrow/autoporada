import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Campus } from '@/domain/cs';
import type { DraftPerson } from '@/domain/report';
import type { FutureEvent, FutureState, ReportState } from '@/domain/review';

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
export const reportState = pgEnum('report_state', ['none', 'prompted', 'written', 'declined']);

/** Who is behind an akce and in which words: „za … koordinuje …“ (the snapshot's `responsible`). */
export interface Responsible {
  readonly verb: 'organizuje' | 'koordinuje' | 'zajišťuje' | 'vede';
  readonly behalfOf?: string;
  readonly people: readonly DraftPerson[];
}

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
    responsible: jsonb().$type<Responsible>(),
    /** Only an akce; the author is asked for a report after its last day. */
    expectsReport: boolean().notNull().default(false),
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
    check('future_items_expects_akce', sql`NOT ${t.expectsReport} OR ${t.kind} = 'akce'`),
    check('future_items_report_needs_expect', sql`${t.reportState} = 'none' OR ${t.expectsReport}`),
    check(
      'future_items_dates',
      sql`${t.endDate} IS NULL OR (${t.startDate} IS NOT NULL AND ${t.endDate} >= ${t.startDate})`,
    ),
    check('future_items_campus', sql`${t.campus} IS NULL OR ${t.campus} IN (${campusList})`),
    check(
      'future_items_lengths',
      sql`char_length(${t.title}) <= 200 AND char_length(coalesce(${t.place}, '')) <= 120`,
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
    event: text().$type<FutureEvent | 'edit'>().notNull(),
    fromState: futureState().$type<FutureState>().notNull(),
    toState: futureState().$type<FutureState>().notNull(),
    note: text(),
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
      sql`${t.event} NOT IN ('return','reject') OR ${t.note} IS NOT NULL`,
    ),
  ],
);
