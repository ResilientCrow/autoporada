import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { newDraft } from '@/domain/report';

import { futureFixtures, readyAkce } from '../../../../test/support/future';
import { BULLETS, pointFixtures, readyReport } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { saveFuture, startFutureReport } from '../future';
import { submitPoint } from './index';

const world = setupWorld();
const akce = futureFixtures(world);
const points = pointFixtures(world);

const DAY = 86_400_000;
const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });

/** A draft report started from the author's due akce; both ids and the report's version. */
async function startedReport(author: UserRecord) {
  const itemId = await akce.start(author, 'akce');
  await world.run(saveFuture, world.as(author), {
    id: itemId,
    expectedVersion: 1,
    content: readyAkce(),
  });
  await akce.moveTo(author, itemId, 'approved');
  world.clock.advance(30 * DAY);
  const started = await world.run(startFutureReport, world.as(author), {
    id: itemId,
  });
  if (!started.ok) throw new Error(`start refused: ${started.error.code}`);
  return { itemId, pointId: started.value.pointId };
}
const submit = (by: UserRecord, id: string, expectedVersion = 1) =>
  world.run(submitPoint, world.as(by), { id, expectedVersion, content: readyReport() });

describe('points.submit for a report that answers an akce', () => {
  it('marks the akce’s report as written and names the akce in the audit event', async () => {
    const author = await user();
    const { itemId, pointId } = await startedReport(author);
    expect((await submit(author, pointId)).ok).toBe(true);

    const { item, audit } = await akce.snapshot(itemId);
    expect(item).toMatchObject({ reportState: 'written', reportPointId: pointId });
    const [submitted, written] = audit.slice(-2);
    expect(submitted).toMatchObject({ action: 'point.submitted', targetId: pointId });
    expect(submitted?.data).toMatchObject({
      related: expect.arrayContaining([{ type: 'future_item', id: itemId }]),
    });
    expect(written).toMatchObject({
      action: 'future.report-written',
      targetType: 'future_item',
      targetId: itemId,
      data: { diff: { reportState: { from: 'none', to: 'written' } } },
    });
  });

  it('does not write the state a second time when the report is handed in again', async () => {
    const author = await user();
    const { itemId, pointId } = await startedReport(author);
    await submit(author, pointId);
    await points.moveTo(author, pointId, 'returned');
    const before = await akce.snapshot(itemId);
    expect((await submit(author, pointId, 3)).ok).toBe(true);
    expect((await akce.snapshot(itemId)).item).toEqual(before.item);
  });

  it('still marks the report written when the akce went back to review with a report expected', async () => {
    const author = await user();
    const { itemId, pointId } = await startedReport(author);
    const { item } = await akce.snapshot(itemId);
    const revised = await world.run(saveFuture, world.as(author), {
      id: itemId,
      expectedVersion: item!.version,
      content: readyAkce({ title: 'Výlet do Brna' }),
      intent: 'revise',
    });
    expect(revised.ok).toBe(true);
    expect((await submit(author, pointId)).ok).toBe(true);
    expect((await akce.snapshot(itemId)).item).toMatchObject({
      state: 'submitted',
      reportState: 'written',
    });
  });

  it('writes nothing on an akce for a point that answers none', async () => {
    const author = await user();
    const id = await points.start(author);
    expect((await submit(author, id)).ok).toBe(true);
    const { audit } = await points.snapshot(id);
    expect(audit.some((row) => row.targetType === 'future_item')).toBe(false);
  });

  it('leaves the akce alone for a second point that names it but is not its report', async () => {
    const author = await user();
    const { itemId } = await startedReport(author);
    const stray = await world.tx(world.as(author), async (tx) => {
      const { point } = await tx.points.create({
        clientRef: '00000000-0000-4000-8000-0000000000aa',
        kind: 'report',
        content: newDraft(BULLETS),
        futureItemId: itemId,
      });
      await tx.audit.record({ action: 'point.test', target: { type: 'point', id: point.id } });
      return point;
    });
    expect((await submit(author, stray.id)).ok).toBe(true);
    expect((await akce.snapshot(itemId)).item?.reportState).toBe('none');
  });
});
