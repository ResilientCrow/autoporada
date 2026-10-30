import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import { ScopeViolation, type PointEventRepo, type TxContext } from '@/application/ports';

import { pointEvents, points } from '../schema';
import type { TxDatabase } from './database';
import { visiblePoints } from './points-read';

/**
 * What every event repository shares (point and future events): the actor is the transaction's
 * user, null for the system, and `createdAt` the call's instant, so a caller cannot write either.
 */
export const eventActor = ({ principal }: TxContext): string | null =>
  principal.kind === 'user' ? principal.actor.id : null;

/** Events are listed newest first, ties to the higher id. */
export const newestFirst = (table: {
  readonly createdAt: AnyPgColumn;
  readonly id: AnyPgColumn;
}) => [desc(table.createdAt), desc(table.id)];

/** The parent table of an event log and the rows of it the principal may see (`undefined`: all). */
export interface EventParent {
  readonly table: PgTable;
  readonly key: AnyPgColumn;
  readonly visible: SQL | undefined;
}

/**
 * Refuses an append to a parent outside the principal's scope, or unknown to a scoped one, with
 * ScopeViolation; the scoped select runs before the insert, so it is allowed in read mode. An
 * unscoped principal (the system) is not checked: an unknown parent is the foreign key's to refuse.
 */
export async function requireVisible(db: TxDatabase, parent: EventParent, id: string) {
  if (!parent.visible) return;
  const [seen] = await db
    .select({ one: sql<number>`1` })
    .from(parent.table)
    .where(and(eq(parent.key, id), parent.visible));
  if (!seen) throw new ScopeViolation();
}

const POINTS: Pick<EventParent, 'table' | 'key'> = { table: points, key: points.id };

const EVENT_ROW = {
  id: pointEvents.id,
  pointId: pointEvents.pointId,
  actorId: pointEvents.actorId,
  event: pointEvents.event,
  fromState: pointEvents.fromState,
  toState: pointEvents.toState,
  note: pointEvents.note,
  editedFields: pointEvents.editedFields,
  before: pointEvents.before,
  createdAt: pointEvents.createdAt,
};

/**
 * Point events over the transaction's connection, scoped through the point; future events
 * (future-events.ts) are scoped through the future item the same way.
 */
export function createPointEventRepo(db: TxDatabase, ctx: TxContext): PointEventRepo {
  const { principal, now } = ctx;
  const actorId = eventActor(ctx);

  return {
    async append({ pointId, event, fromState, toState, note, editedFields, before }) {
      await requireVisible(db, { ...POINTS, visible: visiblePoints(ctx) }, pointId);
      const [row] = await db
        .insert(pointEvents)
        .values({
          pointId,
          actorId,
          event,
          fromState,
          toState,
          note,
          editedFields: editedFields && [...editedFields],
          before,
          createdAt: now,
        })
        .returning(EVENT_ROW);
      if (!row) throw new Error('append: no event row returned');
      return row;
    },
    async list(pointId) {
      return await db
        .select(EVENT_ROW)
        .from(pointEvents)
        .innerJoin(points, eq(points.id, pointEvents.pointId))
        .where(and(eq(pointEvents.pointId, pointId), visiblePoints(ctx)))
        .orderBy(...newestFirst(pointEvents));
    },
    async mailFacts(id) {
      if (principal.kind !== 'system') throw new ScopeViolation();
      // The columns migration 0017 grants the worker, and no other (F2).
      const [row] = await db
        .select({
          id: pointEvents.id,
          pointId: pointEvents.pointId,
          event: pointEvents.event,
          toState: pointEvents.toState,
        })
        .from(pointEvents)
        .where(eq(pointEvents.id, id));
      return row ?? null;
    },
  };
}
