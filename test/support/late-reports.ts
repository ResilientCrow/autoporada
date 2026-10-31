/**
 * Reports and akce for the tests of the late-report mails and queries (ADR 0035): a report point
 * about an event on given days, an approved akce that expects a report, a link between them.
 */
import { randomUUID } from 'node:crypto';

import type { FutureItemPatch, PointRecord, UserRecord } from '@/application/ports';
import { createPoint, saveFuture } from '@/application/use-cases';
import { calDate, parseIsoDate, parseWallTime } from '@/domain/time';

import { futureFixtures, readyAkce } from './future';
import { BULLETS, pointFixtures } from './points';
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

  /** A new report of the author's; every one gets a type of its own (a type's name is unique). */
  async function startReport(author: UserRecord): Promise<string> {
    const type = await world.seed.pointType({
      name: `Seminář ${randomUUID()}`,
      position: 1,
      defaultBullets: BULLETS,
    });
    const result = await world.run(createPoint, world.as(author), {
      clientRef: randomUUID(),
      kind: 'report',
      typeId: type.id,
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

  /** An approved akce of the author's that expects a report, on the days given. */
  async function akce(
    author: UserRecord,
    { day, endDay = null, timeTo }: EventDays,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const id = await futures.start(author, 'akce');
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

  const patchAkce = (author: UserRecord, id: string, over: FutureItemPatch) =>
    world.tx(world.as(author), async (tx) => {
      const item = (await tx.futureItems.loadForWrite(id))!;
      await tx.futureItems.update(id, item.version, over);
      await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
    });

  return { startReport, report, akce, patchAkce };
}
