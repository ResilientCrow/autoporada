import {
  ScopeViolation,
  type FutureEventRecord,
  type FutureEventRepo,
  type NewFutureEvent,
  type TxContext,
} from '@/application/ports';

import { codePoints, newestFirst } from './events';
import { futureReviewable } from './future-items';
import { guard, refusedBy } from './guards';
import { newId, type FakeState, type FakeTxState } from './state';

/**
 * What migrations 0019 and 0020 refuse, in PostgreSQL's order: the CHECKs by name, then the
 * foreign keys in the order the migration made them.
 */
function refuse(state: FakeState, row: FutureEventRecord): void {
  if (row.note !== null && (codePoints(row.note) < 1 || codePoints(row.note) > 2000)) {
    throw refusedBy('future_events_note');
  }
  if ((row.event === 'return' || row.event === 'reject') && row.note === null) {
    throw refusedBy('future_events_note_required');
  }
  if (!state.futureItems.has(row.futureItemId)) {
    throw refusedBy('future_events_future_item_id_future_items_id_fk');
  }
  if (row.actorId !== null && !state.users.has(row.actorId)) {
    throw refusedBy('future_events_actor_id_users_id_fk');
  }
}

/** The future event repository over the fake state: append-only, scoped through the item's history scope. */
export function fakeFutureEventRepo(tx: FakeTxState, ctx: TxContext): FutureEventRepo {
  const { principal, now } = ctx;
  const readable = futureReviewable(principal);
  const unscoped = principal.kind === 'system';
  const inScope = (futureItemId: string) => {
    const item = tx.draft.futureItems.get(futureItemId);
    return item !== undefined && readable(item);
  };

  return {
    async append(event: NewFutureEvent) {
      // As pg: the scoped select runs first (allowed in read mode), the insert is what read mode refuses.
      guard(tx, false);
      // An unscoped principal (the system): an unknown item is the foreign key's to refuse.
      if (!unscoped && !inScope(event.futureItemId)) throw new ScopeViolation();
      guard(tx, true);
      const row: FutureEventRecord = {
        id: newId(tx.draft),
        futureItemId: event.futureItemId,
        actorId: principal.kind === 'user' ? principal.actor.id : null,
        event: event.event,
        fromState: event.fromState,
        toState: event.toState,
        note: event.note ?? null,
        editedFields: event.editedFields ? [...event.editedFields] : null,
        createdAt: now,
      };
      refuse(tx.draft, row);
      tx.draft.futureEvents.set(row.id, row);
      tx.written.push({ type: 'future_item', id: row.futureItemId });
      return row;
    },
    async list(futureItemId) {
      guard(tx, false);
      if (!unscoped && !inScope(futureItemId)) return [];
      return [...tx.draft.futureEvents.values()]
        .filter((e) => e.futureItemId === futureItemId)
        .sort(newestFirst);
    },
  };
}
