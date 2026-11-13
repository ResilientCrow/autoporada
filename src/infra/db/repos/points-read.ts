import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  DatabaseFailure,
  scopeOf,
  ScopeViolation,
  type PointCursor,
  type PointRecord,
  type PointRepo,
  type TxContext,
} from '@/application/ports';
import { parsePointJsonb, type PointJsonb } from '@/contracts';
import { parseIsoDate, toIsoDate } from '@/domain/time';

import { scopeWhere } from '../scope-sql';
import { pointEvents, points } from '../schema';
import type { TxDatabase } from './database';
import { PARSE_FAILURE, queuedPoints } from './points-queue';
import { dateOrNull, timeOrNull } from './wall-columns';

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
  futureItemId: points.futureItemId,
  earliestMonday: points.earliestMonday,
  submittedAt: points.submittedAt,
  handInMonday: points.handInMonday,
  version: points.version,
  updatedAt: points.updatedAt,
};

type PointRow = Pick<typeof points.$inferSelect, keyof typeof POINT_ROW>;

/** The jsonb columns through the contract's one parse, on read and before write. */
export function parseJsonb(value: { [K in keyof PointJsonb]: unknown }): PointJsonb {
  const parsed = parsePointJsonb(value);
  if (!parsed) throw new DatabaseFailure(PARSE_FAILURE);
  return parsed;
}

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
    futureItemId: row.futureItemId,
    earliestMonday: dateOrNull(row.earliestMonday),
    submittedAt,
    handInMonday: dateOrNull(row.handInMonday),
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
  handInMonday: points.handInMonday,
  returnNote,
  version: points.version,
  updatedAt: points.updatedAt,
};

export function createPointReads(
  db: TxDatabase,
  ctx: TxContext,
): Pick<
  PointRepo,
  | 'get'
  | 'loadForWrite'
  | 'listMine'
  | 'queue'
  | 'mailFacts'
  | 'countSubmittedSince'
  | 'handedInFor'
> {
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
        handInMonday: dateOrNull(row.handInMonday),
      }));
    },
    async queue(limit) {
      return queuedPoints(db, visiblePoints(ctx), limit);
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
    async handedInFor(monday) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      // The columns migrations 0017, 0024 and 0027 grant the worker, and no other.
      const rows = await db
        .select({
          state: points.state,
          earliestMonday: points.earliestMonday,
          handInMonday: points.handInMonday,
        })
        .from(points)
        .where(
          and(
            inArray(points.state, ['submitted', 'approved', 'returned']),
            lte(points.earliestMonday, toIsoDate(monday)),
            isNotNull(points.handInMonday),
          ),
        );
      return rows.flatMap(({ state, earliestMonday, handInMonday }) =>
        (state === 'submitted' || state === 'approved' || state === 'returned') &&
        earliestMonday !== null &&
        handInMonday !== null
          ? [
              {
                state,
                earliestMonday: parseIsoDate(earliestMonday),
                handInMonday: parseIsoDate(handInMonday),
              },
            ]
          : [],
      );
    },
    async countSubmittedSince({ since, notBy }) {
      if (ctx.principal.kind !== 'system') throw new ScopeViolation();
      // The columns migrations 0017 and 0024 grant the worker, and no other.
      const [row] = await db
        .select({ count: count() })
        .from(points)
        .where(
          and(
            eq(points.state, 'submitted'),
            gt(points.submittedAt, since),
            ne(points.authorId, notBy),
          ),
        );
      return row?.count ?? 0;
    },
  };
}
