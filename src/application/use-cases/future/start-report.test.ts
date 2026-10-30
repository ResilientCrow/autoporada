import { describe, expect, it } from 'vitest';

import type { FutureItemPatch, UserRecord } from '@/application/ports';
import { DRAFT_CAP } from '@/domain/report';
import { parseIsoDate } from '@/domain/time';

import { futureFixtures, readyAkce, staffer } from '../../../../test/support/future';
import { BULLETS, pointFixtures } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { withdrawPoint } from '../points';
import { declineFutureReport, saveFuture, startFutureReport } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);
const points = pointFixtures(world);

const DAY = 86_400_000;
const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const type = (over: Record<string, unknown> = {}) =>
  world.seed.pointType({ name: 'Seminář', position: 1, defaultBullets: BULLETS, ...over });
const startReport = (by: UserRecord, id: string, typeId: string) =>
  world.run(startFutureReport, world.as(by), { id, typeId });
const decline = (by: UserRecord, id: string) =>
  world.run(declineFutureReport, world.as(by), { id });
const patch = (author: UserRecord, id: string, over: FutureItemPatch) =>
  world.tx(world.as(author), async (tx) => {
    const item = (await tx.futureItems.loadForWrite(id))!;
    await tx.futureItems.update(id, item.version, over);
    await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
  });

/** An approved akce that expects a report, whose last day (11 November) is past. */
async function dueAkce(author: UserRecord, content = readyAkce()): Promise<string> {
  const id = await start(author, 'akce');
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
  it('starts a draft report of the chosen type, prefilled from the akce', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const { id: typeId } = await type();
    const started = await startReport(author, id, typeId);
    if (!started.ok) throw new Error(`refused: ${started.error.code}`);
    const { pointId } = started.value;

    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point).toMatchObject({
      kind: 'report',
      typeId,
      state: 'draft',
      authorId: author.id,
      futureItemId: id,
      content: {
        title: 'Výlet do Prahy',
        eventDate: parseIsoDate('2026-11-10'),
        endDate: parseIsoDate('2026-11-11'),
        campus: 'radlice',
        place: 'v Národním muzeu',
        opening: '',
        openingEdited: false,
      },
    });
    // The people responsible take the organisers' place; the other bullets start empty.
    const [organisers, results] = point!.content.bullets;
    expect(organisers).toMatchObject({ key: 'organisers', kind: 'people', order: 'input' });
    expect(organisers).toMatchObject({ people: [expect.objectContaining(staffer)] });
    expect(results).toMatchObject({ key: 'results', kind: 'text', text: '' });

    const { item } = await snapshot(id);
    expect(item).toMatchObject({ reportPointId: pointId, reportState: 'none' });
  });

  it('audits the link and the draft, naming no text of the akce', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const { id: typeId } = await type();
    const started = await startReport(author, id, typeId);
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
    const { id: typeId } = await type();
    const first = await startReport(author, id, typeId);
    const before = await snapshot(id);
    world.clock.advance(60_000);
    expect(await startReport(author, id, typeId)).toEqual(first);
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
      const { id: typeId } = await type();
      const first = await startReport(author, id, typeId);
      const firstId = first.ok ? first.value.pointId : '';
      expect((await withdraw(author, firstId)).ok).toBe(true);

      const second = await startReport(author, id, typeId);
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
      const { id: typeId } = await type();
      const first = await startReport(author, id, typeId);
      await withdraw(author, first.ok ? first.value.pointId : '');
      const second = await startReport(author, id, typeId);
      const before = await snapshot(id);
      expect(await startReport(author, id, typeId)).toEqual(second);
      expect(await snapshot(id)).toEqual(before);
    });

    it('does so again when the new report is withdrawn too', async () => {
      const author = await user();
      const id = await dueAkce(author);
      const { id: typeId } = await type();
      const ids = new Set<string>();
      for (let i = 0; i < 3; i++) {
        const started = await startReport(author, id, typeId);
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
    const { id: typeId } = await type();
    const first = await startReport(author, id, typeId);
    const pointId = first.ok ? first.value.pointId : '';
    await world.tx(world.as(author), async (tx) => {
      const point = (await tx.points.loadForWrite(pointId))!;
      await tx.points.update(pointId, point.version, {
        content: { ...point.content, title: 'Vlastní název' },
      });
      await tx.audit.record({ action: 'point.test', target: { type: 'point', id: pointId } });
    });
    expect(await startReport(author, id, typeId)).toEqual(first);
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content.title).toBe('Vlastní název');
  });

  it('leaves the people out when the type has no organisers bullet', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const bare = await type({ name: 'Jiné', defaultBullets: [BULLETS[1]!] });
    const started = await startReport(author, id, bare.id);
    const pointId = started.ok ? started.value.pointId : '';
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content.bullets).toEqual([expect.objectContaining({ key: 'results' })]);
  });

  it('takes an akce without responsible people or dates beyond the start', async () => {
    const author = await user();
    const id = await dueAkce(author, readyAkce({ endDate: null, responsible: null }));
    const { id: typeId } = await type();
    const started = await startReport(author, id, typeId);
    const pointId = started.ok ? started.value.pointId : '';
    const point = await world.tx(world.as(author), (tx) => tx.points.get(pointId), 'read');
    expect(point?.content).toMatchObject({ endDate: null });
    expect(point?.content.bullets[0]).toMatchObject({ people: [] });
  });

  it('finds nothing for a colleague, a reviewer or a student who may read the akce', async () => {
    const id = await dueAkce(await user());
    const { id: typeId } = await type();
    const others = [
      await user(),
      await user('reviewer'),
      await user('headmaster'),
      await world.seed.user({ role: 'submitter', isStudent: true }),
    ];
    for (const other of others) {
      await refuses(id, () => startReport(other, id, typeId), { code: 'not-found' });
    }
  });

  it('refuses a type that is unknown or switched off', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const off = await type({ active: false });
    const invalid = { code: 'invalid-input', fields: { typeId: 'invalid' } };
    await refuses(id, () => startReport(author, id, off.id), invalid);
    await refuses(
      id,
      () => startReport(author, id, '00000000-0000-4000-8000-000000000999'),
      invalid,
    );
  });

  it('refuses while the akce is still running or on its last day', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 1,
      content: readyAkce(),
    });
    await moveTo(author, id, 'approved');
    const { id: typeId } = await type();
    await refuses(id, () => startReport(author, id, typeId), rule);
    world.clock.advance(23 * DAY);
    // 11 November 2026, 10:00 in Prague: the last day.
    await refuses(id, () => startReport(author, id, typeId), rule);
    world.clock.advance(DAY);
    expect((await startReport(author, id, typeId)).ok).toBe(true);
  });

  it('decides by the Prague day: 23.30 on the last day is too early, 0.30 after it is due', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const { id: typeId } = await type();
    // 11 November 2026 is the last day: 23:30 in Prague is still 22:30 UTC on the 11th.
    world.clock.set(new Date('2026-11-11T22:30:00Z'));
    await refuses(id, () => startReport(author, id, typeId), rule);
    // 0:30 on the 12th in Prague is 23:30 UTC on the 11th, the same UTC date as above.
    world.clock.set(new Date('2026-11-11T23:30:00Z'));
    expect((await startReport(author, id, typeId)).ok).toBe(true);
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
    const { id: typeId } = await type();
    await refuses(id, () => startReport(author, id, typeId), { code: 'forbidden' });
  });

  it('refuses an akce that expects no report', async () => {
    const author = await user();
    const id = await dueAkce(author, readyAkce({ expectsReport: false }));
    const { id: typeId } = await type();
    await refuses(id, () => startReport(author, id, typeId), rule);
  });

  it.each(['written', 'declined'] as const)('refuses an akce whose report is %s', async (state) => {
    const author = await user();
    const id = await dueAkce(author);
    await patch(author, id, { reportState: state });
    const { id: typeId } = await type();
    await refuses(id, () => startReport(author, id, typeId), rule);
  });

  it('refuses a fifty-first draft, as a new point does', async () => {
    const author = await user();
    const id = await dueAkce(author);
    const { id: typeId } = await type();
    for (let i = 0; i < DRAFT_CAP; i++) await points.start(author, 'pokyn');
    await refuses(id, () => startReport(author, id, typeId), { code: 'rule', rule: 'draft-cap' });
  });
});

describe('future.declineReport', () => {
  it('records that no report will be written, in the audit by its states only', async () => {
    const author = await user();
    const id = await dueAkce(author);
    expect(await decline(author, id)).toMatchObject({ ok: true, value: { version: 4 } });
    const { item, audit } = await snapshot(id);
    expect(item).toMatchObject({ reportState: 'declined', state: 'approved', version: 4 });
    expect(audit.at(-1)).toMatchObject({
      action: 'future.report-declined',
      targetType: 'future_item',
      targetId: id,
      data: { diff: { reportState: { from: 'none', to: 'declined' } }, meta: { kind: 'akce' } },
    });
  });

  it('takes a report that was prompted', async () => {
    const author = await user();
    const id = await dueAkce(author);
    await patch(author, id, { reportState: 'prompted' });
    expect((await decline(author, id)).ok).toBe(true);
  });

  it('does not offer the report afterwards', async () => {
    const author = await user();
    const id = await dueAkce(author);
    await decline(author, id);
    const { id: typeId } = await type();
    await refuses(id, () => decline(author, id), rule);
    await refuses(id, () => startReport(author, id, typeId), rule);
  });

  it('finds nothing for anyone but the author', async () => {
    const id = await dueAkce(await user());
    for (const other of [await user(), await user('reviewer')]) {
      await refuses(id, () => decline(other, id), { code: 'not-found' });
    }
  });

  it('refuses an akce that is not approved or expects no report', async () => {
    const author = await user();
    const draft = await start(author, 'akce');
    await refuses(draft, () => decline(author, draft), { code: 'forbidden' });
    const none = await dueAkce(author, readyAkce({ expectsReport: false }));
    await refuses(none, () => decline(author, none), rule);
  });
});
