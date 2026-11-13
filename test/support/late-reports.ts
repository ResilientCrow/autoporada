/**
 * Reports and akce for the tests of the late-report mails and queries (ADR 0035): a report point
 * about an event on given days, an approved akce (which owes one) or jednání, a link between them.
 */
import { randomUUID } from 'node:crypto';

import type { FutureItemPatch, PointRecord, UserRecord } from '@/application/ports';
import { createPoint, saveFuture } from '@/application/use-cases';
import type { FutureKind } from '@/domain/calendar';
import { calDate, parseIsoDate, parseWallTime } from '@/domain/time';

import { futureFixtures, readyAkce } from './future';
import { pointFixtures } from './points';
import type { World } from './world';

/** What a report's close depends on, as ISO text. */
export interface EventDays {
  readonly day: string;
  readonly endDay?: string | null;
  readonly timeTo: string | null;
}

export function lateReportFixtures(world: World) {
  const futures = futureFixtures(world);
  const points = pointFixtures(world);

  /** A new report of the author's. */
  async function startReport(author: UserRecord): Promise<string> {
    const result = await world.run(createPoint, world.as(author), {
      clientRef: randomUUID(),
      kind: 'report',
      typeId: 'soutez',
    });
    if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
    return result.value.id;
  }

  /** A report of the author's about the event, in `state` (a draft unless it is moved). */
  async function report(
    author: UserRecord,
    { day, endDay = null, timeTo }: EventDays,
    state: PointRecord['state'] = 'draft',
    handIn = calDate(2026, 11, 2),
  ): Promise<string> {
    const id = await startReport(author);
    await world.tx(world.as(author), async (tx) => {
      const point = (await tx.points.loadForWrite(id))!;
      await tx.points.update(id, point.version, {
        content: {
          ...point.content,
          title: 'Seminář',
          eventDate: parseIsoDate(day),
          endDate: endDay === null ? null : parseIsoDate(endDay),
          timeTo: timeTo === null ? null : parseWallTime(timeTo),
        },
      });
      await tx.audit.record({ action: 'point.test', target: { type: 'point', id } });
    });
    if (state !== 'draft') await points.moveTo(author, id, state, handIn);
    return id;
  }

  /** An approved item of the author's, on the days given. */
  async function approved(
    kind: FutureKind,
    author: UserRecord,
    { day, endDay = null, timeTo }: EventDays,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const id = await futures.start(author, kind);
    const content = readyAkce({ startDate: day, endDate: endDay, timeTo, ...over });
    const saved = await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 1,
      content,
    });
    if (!saved.ok) throw new Error(`save refused: ${saved.error.code}`);
    await futures.moveTo(author, id, 'approved');
    return id;
  }

  /** An approved akce of the author's, on the days given: it owes a report once it ends. */
  const akce = (author: UserRecord, days: EventDays, over: Record<string, unknown> = {}) =>
    approved('akce', author, days, over);
  /** An approved jednání of the author's, on the days given: it owes no report. */
  const jednani = (author: UserRecord, days: EventDays) => approved('jednani', author, days);

  const patchAkce = (author: UserRecord, id: string, over: FutureItemPatch) =>
    world.tx(world.as(author), async (tx) => {
      const item = (await tx.futureItems.loadForWrite(id))!;
      await tx.futureItems.update(id, item.version, over);
      await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
    });

  return { startReport, report, akce, jednani, patchAkce };
}
