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

import type { PointEventName } from '@/application/ports';
import type { Campus } from '@/domain/cs';
import type { DraftBullet, DraftStatement, PointFieldValues } from '@/domain/report';
import type { RichDoc } from '@/domain/richtext';

import { at, createdAt, id } from './columns';
import { users } from './identity';
import { pointTypes } from './point-types';

/** The values of `PointKind` (domain/report); points.test.ts holds the two together. */
export const pointKind = pgEnum('point_kind', ['report', 'finance', 'pokyn']);
/** The values of `PointState` (domain/review); points.test.ts holds the two together. */
export const pointState = pgEnum('point_state', [
  'draft',
  'submitted',
  'returned',
  'approved',
  'rejected',
  'withdrawn',
  'published',
]);

/** Every `Campus` once: the compiler refuses a missing or an unknown one. */
const CAMPUSES: Readonly<Record<Campus, true>> = {
  smichov: true,
  radlice: true,
  'na-vidouli': true,
  jinde: true,
};
const campusList = sql.raw(
  Object.keys(CAMPUSES)
    .map((campus) => `'${campus}'`)
    .join(','),
);

/**
 * A point for the meeting: a report, or a HOSPODAŘENÍ or POKYNY proposal
 * (design §2). It holds what its author wrote, so it is personal data. The
 * CHECKs back up Zod and the use cases; none is a known constraint. Migration
 * 0016 lets `version` rise only by one per update and fixes `earliest_monday`
 * once it is set.
 */
export const points = pgTable(
  'points',
  {
    id: id(),
    kind: pointKind().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    /** The draft's id in the author's browser: a retried create finds the row it made. */
    clientRef: uuid().notNull(),
    typeId: uuid().references(() => pointTypes.id),
    state: pointState().notNull().default('draft'),
    title: text().notNull().default(''),
    eventDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    timeFrom: time(),
    timeTo: time(),
    campus: text().$type<Campus>(),
    place: text(),
    opening: text().notNull().default(''),
    openingEdited: boolean().notNull().default(false),
    body: jsonb().$type<RichDoc>().notNull(),
    bullets: jsonb()
      .$type<readonly DraftBullet[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    statements: jsonb()
      .$type<readonly DraftStatement[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Set once, at the first submit. */
    earliestMonday: date({ mode: 'string' }),
    /** Set at every submit and never cleared: "ever submitted". */
    submittedAt: at(),
    /** The future item a report answers; its foreign key comes in M8b (commit 51). */
    futureItemId: uuid(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    unique('points_author_client_ref_key').on(t.authorId, t.clientRef),
    index('points_author_idx').on(t.authorId, t.updatedAt.desc()),
    index('points_queue_idx')
      .on(t.state, t.earliestMonday)
      .where(sql`${t.state} IN ('submitted','approved')`),
    check('points_kind_type', sql`(${t.kind} = 'report') = (${t.typeId} IS NOT NULL)`),
    check(
      'points_dates',
      sql`${t.endDate} IS NULL OR (${t.eventDate} IS NOT NULL AND ${t.endDate} >= ${t.eventDate})`,
    ),
    check('points_campus', sql`${t.campus} IS NULL OR ${t.campus} IN (${campusList})`),
    check(
      'points_monday',
      sql`${t.earliestMonday} IS NULL OR extract(isodow from ${t.earliestMonday}) = 1`,
    ),
    check(
      'points_lengths',
      sql`char_length(${t.title}) <= 200 AND char_length(${t.opening}) <= 1000 AND char_length(coalesce(${t.place}, '')) <= 120`,
    ),
    check(
      'points_content_size',
      sql`octet_length(${t.body}::text) + octet_length(${t.bullets}::text) + octet_length(${t.statements}::text) <= 262144`,
    ),
    check(
      'points_submitted_complete',
      sql`${t.state} NOT IN ('submitted','approved','published')
        OR (${t.title} <> '' AND ${t.earliestMonday} IS NOT NULL AND ${t.submittedAt} IS NOT NULL
            AND (${t.kind} <> 'report' OR (${t.eventDate} IS NOT NULL AND ${t.opening} <> '')))`,
    ),
  ],
);

/**
 * What happened to a point and who did it, append-only (migration 0016).
 * Deleting a point deletes its events.
 */
export const pointEvents = pgTable(
  'point_events',
  {
    id: id(),
    pointId: uuid()
      .notNull()
      .references(() => points.id, { onDelete: 'cascade' }),
    /** Null for a system event (publish, M10). */
    actorId: uuid().references(() => users.id),
    /** A transition of POINT_MACHINE, or 'edit' for a reviewer's edit. */
    event: text().$type<PointEventName>().notNull(),
    fromState: pointState().notNull(),
    toState: pointState().notNull(),
    note: text(),
    /** A reviewer's edit: the names of the fields it changed. */
    editedFields: text().array(),
    /** A reviewer's edit: the previous values of those fields (D13), as the content holds them. */
    before: jsonb().$type<Partial<PointFieldValues>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('point_events_point_idx').on(t.pointId, t.createdAt),
    check('point_events_note', sql`${t.note} IS NULL OR char_length(${t.note}) BETWEEN 1 AND 2000`),
    check(
      'point_events_note_required',
      sql`${t.event} NOT IN ('return','reject') OR ${t.note} IS NOT NULL`,
    ),
    check('point_events_before_edit', sql`${t.before} IS NULL OR ${t.event} = 'edit'`),
  ],
);
