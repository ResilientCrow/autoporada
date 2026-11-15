import { describe, expect, it } from 'vitest';

import type { FutureItemPatch, UserRecord } from '@/application/ports';
import { DRAFT_CAP } from '@/domain/report';
import { parseIsoDate } from '@/domain/time';

import { futureFixtures, readyAkce } from '../../../../test/support/future';
import { pointFixtures } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { withdrawPoint } from '../points';
import { saveFuture, startFutureReport } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);
const points = pointFixtures(world);

const DAY = 86_400_000;
const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const startReport = (by: UserRecord, id: string) =>
  world.run(startFutureReport, world.as(by), { id });
const patch = (author: UserRecord, id: string, over: FutureItemPatch) =>
  world.tx(world.as(author), async (tx) => {
    const item = (await tx.futureItems.loadForWrite(id))!;
    await tx.futureItems.update(id, item.version, over);
    await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
  });

/** An approved akce, whose last day (10 November) is past: it owes a report. */
async function dueAkce(
  author: UserRecord,
  content = readyAkce(),
  kind: 'akce' | 'jednani' = 'akce',
): Promise<string> {
  const id = await start(author, kind);
  await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
  await moveTo(author, id, 'approved');
  world.clock.advance(30 * DAY);
  return id;
}

const rule = { code: 'rule', rule: 'report-not-due' };

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

describe('future.startReport', () => {
  it('starts a draft report, prefilled from the akce', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const started = await startReport(author, id);
    if (!started.ok) throw new Error(`refused: ${started.error.code}`);
    const { pointId } = started.value;

    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point).toMatchObject({
      kind: 'report',
      state: 'draft',
      authorId: author.id,
      futureItemId: id,
      content: {
        title: 'Výlet do Prahy',
        eventDate: parseIsoDate('2026-11-10'),
        endDate: null,
        campus: 'radlice',
        place: 'v Národním muzeu',
        opening: '',
        openingEdited: false,
      },
    });
    // An akce holds its organizer as text, so no people carry over; the bullets start empty.
    const [organisers, participants] = point!.content.bullets;
    expect(organisers).toMatchObject({ key: 'organisers', kind: 'people', order: 'input' });
    expect(organisers).toMatchObject({ people: [] });
    expect(participants).toMatchObject({ key: 'participants', kind: 'people', people: [] });

    const { item } = await snapshot(id);
    expect(item).toMatchObject({ reportPointId: pointId, reportState: 'none' });
  });

  it('audits the link and the draft, naming no text of the akce', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const started = await startReport(author, id);
    const pointId = started.ok ? started.value.pointId : '';
    const { audit } = await snapshot(id);
    expect(audit.slice(-2).map((row) => [row.action, row.targetType, row.targetId])).toEqual([
      ['point.created', 'point', pointId],
      ['future.report-started', 'future_item', id],
    ]);
    expect(audit.at(-1)?.data).toMatchObject({
      diff: { reportPointId: { from: null, to: pointId } },
      meta: { kind: 'akce' },
    });
    expect(JSON.stringify(audit.slice(-2))).not.toContain('Výlet');
  });

  it('gives the same draft for a second press and writes nothing more', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const first = await startReport(author, id);
    const before = await snapshot(id);
    world.clock.advance(60_000);
    expect(await startReport(author, id)).toEqual(first);
    expect(await snapshot(id)).toEqual(before);
  });

  describe('after the report was withdrawn', () => {
    const withdraw = (by: UserRecord, id: string) =>
      world.run(withdrawPoint, world.as(by), { id, expectedVersion: 1, confirmed: true });
    const pointOf = (by: UserRecord, id: string) =>
      world.tx(world.as(by), (tx) => tx.points.get(id), 'read');

    it('opens a fresh, prefilled draft and relinks the akce to it', async () => {
      const author = await user();
      const id = await dueAkce(author);
      const first = await startReport(author, id);
      const firstId = first.ok ? first.value.pointId : '';
      expect((await withdraw(author, firstId)).ok).toBe(true);

      const second = await startReport(author, id);
      const secondId = second.ok ? second.value.pointId : '';
      expect(secondId).not.toBe('');
      expect(secondId).not.toBe(firstId);
      expect(await pointOf(author, secondId)).toMatchObject({
        state: 'draft',
        futureItemId: id,
        content: { title: 'Výlet do Prahy', place: 'v Národním muzeu' },
      });
      expect((await pointOf(author, firstId))?.state).toBe('withdrawn');
      const { item, audit } = await snapshot(id);
      expect(item).toMatchObject({ reportPointId: secondId, reportState: 'none' });
      expect(audit.at(-1)).toMatchObject({
        action: 'future.report-started',
        data: { diff: { reportPointId: { from: firstId, to: secondId } } },
      });
    });

    it('gives the same new draft for a second press and writes nothing more', async () => {
      const author = await user();
      const id = await dueAkce(author);
      const first = await startReport(author, id);
      await withdraw(author, first.ok ? first.value.pointId : '');
      const second = await startReport(author, id);
      const before = await snapshot(id);
      expect(await startReport(author, id)).toEqual(second);
      expect(await snapshot(id)).toEqual(before);
    });

    it('does so again when the new report is withdrawn too', async () => {
      const author = await user();
      const id = await dueAkce(author);
      const ids = new Set<string>();
      for (let i = 0; i < 3; i++) {
        const started = await startReport(author, id);
        const pointId = started.ok ? started.value.pointId : '';
        ids.add(pointId);
        await withdraw(author, pointId);
      }
      expect(ids.size).toBe(3);
    });
  });

  it('keeps a report the author already edited when it is started again', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const first = await startReport(author, id);
    const pointId = first.ok ? first.value.pointId : '';
    await world.tx(world.as(author), async (tx) => {
      const point = (await tx.points.loadForWrite(pointId))!;
      await tx.points.update(pointId, point.version, {
        content: { ...point.content, title: 'Vlastní název' },
      });
      await tx.audit.record({ action: 'point.test', target: { type: 'point', id: pointId } });
    });
    expect(await startReport(author, id)).toEqual(first);
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content.title).toBe('Vlastní název');
  });

  it('starts every report with the same two rows (ADR 0067)', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const started = await startReport(author, id);
    const pointId = started.ok ? started.value.pointId : '';
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content.bullets).toEqual([
      expect.objectContaining({ key: 'organisers' }),
      expect.objectContaining({ key: 'participants' }),
    ]);
  });

  it('takes an akce without an organizer or dates beyond the start', async () => {
    const author = await user();
    const id = await dueAkce(author, readyAkce({ endDate: null, organizer: null }));
    const started = await startReport(author, id);
    const pointId = started.ok ? started.value.pointId : '';
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content).toMatchObject({ endDate: null });
    expect(point?.content.bullets[0]).toMatchObject({ people: [] });
  });

  it('finds nothing for a colleague, a reviewer or a student who may read the akce', async () => {
    const id = await dueAkce(await user());
    const others = [
      await user(),
      await user('reviewer'),
      await user('headmaster'),
      await world.seed.user({ role: 'submitter', isStudent: true }),
    ];
    for (const other of others) {
      await refuses(id, () => startReport(other, id), { code: 'not-found' });
    }
  });

  it('refuses while the akce is still running or has not yet ended on its last day', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 1,
      content: readyAkce(),
    });
    await moveTo(author, id, 'approved');
    await refuses(id, () => startReport(author, id), rule);
    world.clock.advance(22 * DAY);
    // 10 November 2026, 09:00 in Prague: the last day.
    await refuses(id, () => startReport(author, id), rule);
    world.clock.advance(DAY);
    expect((await startReport(author, id)).ok).toBe(true);
  });

  it('is owed from the akce’s end on its last day, in Prague time', async () => {
    const author = await user();
    const id = await dueAkce(author);
    // The akce ends at 14.30 on 10 November 2026 (CET): 13:30 UTC.
    world.clock.set(new Date('2026-11-10T13:29:00Z'));
    await refuses(id, () => startReport(author, id), rule);
    world.clock.set(new Date('2026-11-10T13:30:00Z'));
    expect((await startReport(author, id)).ok).toBe(true);
  });

  it('is owed from 20.00 on the last day when the akce has no end time', async () => {
    const author = await user();
    const id = await dueAkce(author, readyAkce({ timeTo: null }));
    world.clock.set(new Date('2026-11-10T18:59:00Z'));
    await refuses(id, () => startReport(author, id), rule);
    world.clock.set(new Date('2026-11-10T19:00:00Z'));
    expect((await startReport(author, id)).ok).toBe(true);
  });

  it.each([
    ['a draft', 'draft'],
    ['submitted', 'submitted'],
    ['cancelled', 'cancelled'],
  ] as const)('refuses an akce that is %s', async (_name, state) => {
    const author = await user();
    const id = await start(author, 'akce');
    await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 1,
      content: readyAkce(),
    });
    if (state !== 'draft') await moveTo(author, id, state);
    world.clock.advance(30 * DAY);
    await refuses(id, () => startReport(author, id), { code: 'forbidden' });
  });

  it('refuses a jednání: only an akce owes a report', async () => {
    const author = await user();
    const id = await dueAkce(author, readyAkce(), 'jednani');
    await refuses(id, () => startReport(author, id), rule);
  });

  it('refuses an akce whose report is written', async () => {
    const author = await user();
    const id = await dueAkce(author);
    await patch(author, id, { reportState: 'written' });
    await refuses(id, () => startReport(author, id), rule);
  });

  it('refuses a fifty-first draft, as a new point does', async () => {
    const author = await user();
    const id = await dueAkce(author);
    for (let i = 0; i < DRAFT_CAP; i++) await points.start(author, 'pokyn');
    await refuses(id, () => startReport(author, id), { code: 'rule', rule: 'draft-cap' });
  });
});
