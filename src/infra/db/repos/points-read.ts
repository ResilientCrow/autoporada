import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  DatabaseFailure,
  scopeOf,
  ScopeViolation,
  type PointCursor,
  type PointRecord,
  type PointRepo,
  type QueuedPoint,
  type TxContext,
} from '@/application/ports';
import { parsePointJsonb, parsePointPeople, type PointJsonb } from '@/contracts';
import { parseIsoDate, parseWallTime } from '@/domain/time';

import { scopeWhere } from '../scope-sql';
import { pointEvents, points, pointTypes } from '../schema';
import type { TxDatabase } from './database';

/** The columns a PointRecord is made of; new columns stay out until named here. */
export const POINT_ROW = {
  id: points.id,
  kind: points.kind,
  authorId: points.authorId,
  typeId: points.typeId,
  state: points.state,
  title: points.title,
  eventDate: points.eventDate,
  endDate: points.endDate,
  timeFrom: points.timeFrom,
  timeTo: points.timeTo,
  campus: points.campus,
  place: points.place,
  opening: points.opening,
  openingEdited: points.openingEdited,
  body: points.body,
  bullets: points.bullets,
  statements: points.statements,
  earliestMonday: points.earliestMonday,
  submittedAt: points.submittedAt,
  version: points.version,
  updatedAt: points.updatedAt,
};

type PointRow = Pick<typeof points.$inferSelect, keyof typeof POINT_ROW>;

/** The failure code of jsonb the contract refuses; it never carries the payload (ADR 0015). */
const PARSE_FAILURE = 'db.parse.points';

/** The jsonb columns through the contract's one parse, on read and before write. */
export function parseJsonb(value: { [K in keyof PointJsonb]: unknown }): PointJsonb {
  const parsed = parsePointJsonb(value);
  if (!parsed) throw new DatabaseFailure(PARSE_FAILURE);
  return parsed;
}

const dateOrNull = (iso: string | null) => (iso === null ? null : parseIsoDate(iso));
/** PostgreSQL gives `time` as HH:MM:SS; points keep minutes. */
const timeOrNull = (text: string | null) =>
  text === null ? null : parseWallTime(text.slice(0, 5));

export function toRecord(row: PointRow): PointRecord {
  const { id, kind, authorId, typeId, state, version, updatedAt, submittedAt } = row;
  return {
    id,
    kind,
    authorId,
    typeId,
    state,
    content: {
      title: row.title,
      eventDate: dateOrNull(row.eventDate),
      endDate: dateOrNull(row.endDate),
      timeFrom: timeOrNull(row.timeFrom),
      timeTo: timeOrNull(row.timeTo),
      campus: row.campus,
      place: row.place,
      opening: row.opening,
      openingEdited: row.openingEdited,
      ...parseJsonb(row),
    },
    earliestMonday: dateOrNull(row.earliestMonday),
    submittedAt,
    version,
    updatedAt,
  };
}

/** The rows the principal may see: the SQL projection of the policy's read scope. */
export const visiblePoints = (ctx: TxContext): SQL | undefined =>
  scopeWhere(scopeOf(ctx.principal, 'point'), {
    owner: points.authorId,
    state: points.state,
    submittedAt: points.submittedAt,
  });

/** The user's own rows, whatever the read scope: the system has none. */
function ownPoints({ principal }: TxContext): SQL | undefined {
  if (principal.kind !== 'user') throw new ScopeViolation();
  return scopeWhere({ kind: 'own', userId: principal.actor.id }, { owner: points.authorId });
}

/** The author's list order: last changed first, ties to the higher id. */
const NEWEST_FIRST = [desc(points.updatedAt), desc(points.id)];

/** The rows after `before` in the list's order: an older change, or the same instant and a lower id. */
const after = (before: PointCursor | undefined): SQL | undefined =>
  before &&
  or(
    lt(points.updatedAt, before.updatedAt),
    and(eq(points.updatedAt, before.updatedAt), lt(points.id, before.id)),
  );

/**
 * The newest `return` event's note while the point is returned (the order of `PointEventRepo.list`),
 * else null. Drizzle writes the outer columns unqualified inside a single-table select, so `id` would
 * read as the event's: the outer point is named in full.
 */
const returnNote = sql<string | null>`(
  SELECT e.note FROM ${pointEvents} e
  WHERE e.point_id = "points"."id" AND e.event = 'return' AND "points"."state" = 'returned'
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1
)`.as('return_note');

const SUMMARY_ROW = {
  id: points.id,
  kind: points.kind,
  typeId: points.typeId,
  state: points.state,
  title: points.title,
  eventDate: points.eventDate,
  earliestMonday: points.earliestMonday,
  submittedAt: points.submittedAt,
  returnNote,
  version: points.version,
  updatedAt: points.updatedAt,
};

/** Whether the point was ever returned („Vráceno dříve“): one EXISTS per row, no second query. */
const returnedBefore = sql<boolean>`EXISTS (
  SELECT 1 FROM ${pointEvents} e WHERE e.point_id = "points"."id" AND e.event = 'return'
)`.as('returned_before');

const QUEUE_ROW = {
  id: points.id,
  kind: points.kind,
  authorId: points.authorId,
  state: points.state,
  title: points.title,
  typeName: pointTypes.name,
  earliestMonday: points.earliestMonday,
  submittedAt: points.submittedAt,
  returnedBefore,
};

/** A queue row; `points_submitted_complete` holds the Monday and the submission of a handed-in point. */
function toQueued(row: Awaited<ReturnType<typeof queueRows>>[number]): QueuedPoint {
  const { state, earliestMonday, submittedAt } = row;
  const queued = state === 'submitted' || state === 'approved';
  if (!queued || earliestMonday === null || submittedAt === null) {
    throw new DatabaseFailure(PARSE_FAILURE);
  }
  return { ...row, state, earliestMonday: parseIsoDate(earliestMonday), submittedAt };
}

/**
 * The submitted and approved points in scope: the submitted ones first, so approved points waiting
 * for a porada never push one out past the limit; each the oldest submission first, ties to the lower id.
 */
const queueRows = (db: TxDatabase, ctx: TxContext, limit: number) =>
  db
    .select(QUEUE_ROW)
    .from(points)
    .leftJoin(pointTypes, eq(pointTypes.id, points.typeId))
    .where(and(visiblePoints(ctx), inArray(points.state, ['submitted', 'approved'])))
    .orderBy(sql`${points.state} = 'approved'`, asc(points.submittedAt), asc(points.id))
    .limit(limit);

export function createPointReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<PointRepo, 'get' | 'loadForWrite' | 'listMine' | 'queue' | 'ownRecent' | 'mailFacts'> {
  const byId = (id: string) =>
    db
      .select(POINT_ROW)
      .from(points)
      .where(and(eq(points.id, id), visiblePoints(ctx)));

  return {
    async get(id) {
      const [row] = await byId(id);
      return row ? toRecord(row) : null;
    },
    async loadForWrite(id) {
      const [row] = await byId(id).for('update');
      return row ? toRecord(row) : null;
    },
    async listMine(limit, before) {
      const rows = await db
        .select(SUMMARY_ROW)
        .from(points)
        .where(and(ownPoints(ctx), after(before)))
        .orderBy(...NEWEST_FIRST)
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        eventDate: dateOrNull(row.eventDate),
        earliestMonday: dateOrNull(row.earliestMonday),
      }));
    },
    async queue(limit) {
      return (await queueRows(db, ctx, limit)).map(toQueued);
    },
    async ownRecent({ limit, since }) {
      const rows = await db
        .select({
          bullets: points.bullets,
          statements: points.statements,
          updatedAt: points.updatedAt,
        })
        .from(points)
        .where(and(ownPoints(ctx), gte(points.updatedAt, since)))
        .orderBy(...NEWEST_FIRST)
        .limit(limit);
      return rows.map((row) => {
        const people = parsePointPeople(row);
        if (!people) throw new DatabaseFailure(PARSE_FAILURE);
        return { ...people, updatedAt: row.updatedAt };
      });
    },
    async mailFacts(id) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      // The columns migration 0017 grants the worker, and no other (F2).
      const [row] = await db
        .select({ id: points.id, authorId: points.authorId, state: points.state })
        .from(points)
        .where(eq(points.id, id));
      return row ?? null;
    },
  };
}
