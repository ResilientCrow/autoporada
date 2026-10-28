import { and, desc, eq } from 'drizzle-orm';

import { ScopeViolation, type PointEventRepo, type TxContext } from '@/application/ports';

import { pointEvents, points } from '../schema';
import type { TxDatabase } from './database';
import { visiblePoints } from './points-read';

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
 * Point events over the transaction's connection. The actor is the transaction's user and
 * `createdAt` the call's instant, so a caller cannot write either. Future events (M8b) will
 * share the mapping and the order; they are not generalised here until a second table exists.
 */
export function createPointEventRepo(db: TxDatabase, ctx: TxContext): PointEventRepo {
  const { principal, now } = ctx;
  const actorId = principal.kind === 'user' ? principal.actor.id : null;

  return {
    async append({ pointId, event, fromState, toState, note, editedFields, before }) {
      const visible = visiblePoints(ctx);
      if (visible) {
        const [seen] = await db
          .select({ id: points.id })
          .from(points)
          .where(and(eq(points.id, pointId), visible));
        if (!seen) throw new ScopeViolation();
      }
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
        .orderBy(desc(pointEvents.createdAt), desc(pointEvents.id));
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
