import {
  scopeOf,
  ScopeViolation,
  type NewPointEvent,
  type PointEventRecord,
  type PointEventRepo,
  type TxContext,
} from '@/application/ports';

import { guard, refusedBy } from './guards';
import { pointReadable } from './points';
import { newId, type FakeState, type FakeTxState } from './state';

/** char_length counts code points, as `[...text]` does. */
const codePoints = (text: string) => [...text].length;

/**
 * What migration 0015 refuses, in PostgreSQL's order: the CHECKs by name, then
 * the foreign keys in the order the migration made them.
 */
function refuse(state: FakeState, row: PointEventRecord): void {
  if (row.before !== null && row.event !== 'edit') throw refusedBy('point_events_before_edit');
  if (row.note !== null && (codePoints(row.note) < 1 || codePoints(row.note) > 2000)) {
    throw refusedBy('point_events_note');
  }
  if ((row.event === 'return' || row.event === 'reject') && row.note === null) {
    throw refusedBy('point_events_note_required');
  }
  if (!state.points.has(row.pointId)) throw refusedBy('point_events_point_id_points_id_fk');
  if (row.actorId !== null && !state.users.has(row.actorId)) {
    throw refusedBy('point_events_actor_id_users_id_fk');
  }
}

/** The point event repository over the fake state: append-only, scoped through the point. */
export function fakePointEventRepo(tx: FakeTxState, ctx: TxContext): PointEventRepo {
  const { principal, now } = ctx;
  const readable = pointReadable(principal);
  const unscoped = scopeOf(principal, 'point').kind === 'all';
  const inScope = (pointId: string) => {
    const point = tx.draft.points.get(pointId);
    return point !== undefined && readable(point);
  };

  return {
    async append(event: NewPointEvent) {
      // As pg: the scoped select runs first (allowed in read mode), the insert is what read mode refuses.
      guard(tx, false);
      // An unscoped principal (the system): an unknown point is the foreign key's to refuse.
      if (!unscoped && !inScope(event.pointId)) throw new ScopeViolation();
      guard(tx, true);
      const row: PointEventRecord = {
        id: newId(tx.draft),
        pointId: event.pointId,
        actorId: principal.kind === 'user' ? principal.actor.id : null,
        event: event.event,
        fromState: event.fromState,
        toState: event.toState,
        note: event.note ?? null,
        editedFields: event.editedFields ? [...event.editedFields] : null,
        // jsonb keeps a copy, not the caller's object.
        before: event.before ? structuredClone(event.before) : null,
        createdAt: now,
      };
      refuse(tx.draft, row);
      tx.draft.pointEvents.set(row.id, row);
      tx.written.push({ type: 'point', id: row.pointId });
      return row;
    },
    async list(pointId) {
      guard(tx, false);
      if (!unscoped && !inScope(pointId)) return [];
      return (
        [...tx.draft.pointEvents.values()]
          .filter((e) => e.pointId === pointId)
          // Ties go to the higher id, compared as PostgreSQL compares uuids.
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      );
    },
  };
}
