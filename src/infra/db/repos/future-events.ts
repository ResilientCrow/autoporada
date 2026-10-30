import { and, eq } from 'drizzle-orm';

import type { FutureEventRepo, TxContext } from '@/application/ports';

import { futureEvents, futureItems } from '../schema';
import type { TxDatabase } from './database';
import { eventActor, newestFirst, requireVisible } from './events';
import { visibleFutureItems } from './future-items';

const EVENT_ROW = {
  id: futureEvents.id,
  futureItemId: futureEvents.futureItemId,
  actorId: futureEvents.actorId,
  event: futureEvents.event,
  fromState: futureEvents.fromState,
  toState: futureEvents.toState,
  note: futureEvents.note,
  editedFields: futureEvents.editedFields,
  createdAt: futureEvents.createdAt,
};

/** Future events over the transaction's connection, scoped through the future item (events.ts). */
export function createFutureEventRepo(db: TxDatabase, ctx: TxContext): FutureEventRepo {
  const actorId = eventActor(ctx);
  const parent = { table: futureItems, key: futureItems.id, visible: visibleFutureItems(ctx) };

  return {
    async append({ futureItemId, event, fromState, toState, note, editedFields }) {
      await requireVisible(db, parent, futureItemId);
      const [row] = await db
        .insert(futureEvents)
        .values({
          futureItemId,
          actorId,
          event,
          fromState,
          toState,
          note,
          editedFields: editedFields && [...editedFields],
          createdAt: ctx.now,
        })
        .returning(EVENT_ROW);
      if (!row) throw new Error('append: no event row returned');
      return row;
    },
    async list(futureItemId) {
      return await db
        .select(EVENT_ROW)
        .from(futureEvents)
        .innerJoin(futureItems, eq(futureItems.id, futureEvents.futureItemId))
        .where(and(eq(futureEvents.futureItemId, futureItemId), parent.visible))
        .orderBy(...newestFirst(futureEvents));
    },
  };
}
