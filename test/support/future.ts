/**
 * Future items for the use-case tests of the akce flow: an item started
 * through `future.create`, content a submit accepts, and a state reached past
 * the use cases where no use case leads there yet.
 */
import { randomUUID } from 'node:crypto';

import { system, type UserRecord } from '@/application/ports';
import { createFuture } from '@/application/use-cases';
import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';
import { parseIsoDate } from '@/domain/time';

import type { World } from './world';

export const staffer = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };

/** What the editor sends for an empty item: dates and times as ISO text. */
export const futureWire = (over: Record<string, unknown> = {}) => ({
  title: '',
  startDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  participants: null,
  note: null,
  ...over,
});

/** An akce a submit accepts. */
export const readyAkce = (over: Record<string, unknown> = {}) =>
  futureWire({
    title: 'Výlet do Prahy',
    startDate: '2026-11-10',
    endDate: '2026-11-11',
    timeFrom: '08:00',
    timeTo: '14:30',
    campus: 'radlice',
    place: 'v Národním muzeu',
    organizer: 'zajišťuje 2.A paní učitelka Jana Nováková',
    ...over,
  });

/** A jednání a submit accepts. */
export const readyJednani = (over: Record<string, unknown> = {}) =>
  futureWire({ title: 'Pedagogická rada', startDate: '2026-11-12', timeFrom: '14:00', ...over });

export function futureFixtures(world: World) {
  /** A new item of the author's, made through the use case. */
  async function start(author: UserRecord, kind: FutureKind = 'akce'): Promise<string> {
    const result = await world.run(createFuture, world.as(author), {
      clientRef: randomUUID(),
      kind,
    });
    if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
    return result.value.id;
  }

  /**
   * Moves the author's item to `state` past the use cases, as a review would
   * leave it, filling what a handed-in item must hold (`future_items_submitted_complete`).
   */
  async function moveTo(author: UserRecord, id: string, state: FutureState): Promise<void> {
    await world.tx(world.as(author), async (tx) => {
      const item = (await tx.futureItems.loadForWrite(id))!;
      const { content } = item;
      await tx.futureItems.update(id, item.version, {
        content: {
          ...content,
          title: content.title || 'Výlet',
          startDate: content.startDate ?? parseIsoDate('2026-11-10'),
        },
        state,
        ...(item.submittedAt === null && { submittedAt: world.clock.now() }),
      });
      await tx.audit.record({ action: `future.${state}`, target: { type: 'future_item', id } });
    });
  }

  const get = (by: UserRecord, id: string) =>
    world.tx(world.as(by), (tx) => tx.futureItems.get(id), 'read');

  /** Everything a use case on the item may write, read as the system so no scope hides a row. */
  const snapshot = (id: string) =>
    world.tx(
      system('test.seed'),
      async (tx) => ({
        item: await tx.futureItems.get(id),
        events: await tx.futureEvents.list(id),
        audit: await world.inspect.audit(),
      }),
      'read',
    );

  return { start, moveTo, get, snapshot };
}
