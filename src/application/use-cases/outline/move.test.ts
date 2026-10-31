import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SEED_OUTLINE } from '@/domain/outline';

import { monday, outlineFixtures, WEEK_1, WEEK_2 } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { setSkipped } from '../issues';
import { moveOutlineItem } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const move = (by: User, lineageId: string, direction: string, over: Record<string, unknown> = {}) =>
  world.run(moveOutlineItem, world.as(by), {
    monday: monday(WEEK_1),
    lineageId,
    direction,
    ...over,
  });

const order = async (by: User, section: 'pokyny' | 'hospodareni' = 'pokyny') => {
  const read = await fx.readAs(by, WEEK_1);
  if (!read.ok) throw new Error('read refused');
  return read.value[section].map((r) => r.lineageId);
};
const rule = (code: string) => ({ ok: false, error: { code: 'rule', rule: code } });

describe('outline.move', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await move(user, SEED_OUTLINE.pokyny[1]!.lineageId, 'up')).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('materialises the seed and moves an item one place up or down', async () => {
    const head = await fx.headmaster();
    const seed = SEED_OUTLINE.pokyny.map((r) => r.lineageId);
    const [a, b, c] = seed;
    const down = await move(head, a!, 'down');
    expect(down).toEqual({ ok: true, value: { version: 2, lineageId: a } });
    expect((await order(head)).slice(0, 3)).toEqual([b, a, c]);
    await move(head, c!, 'up', { expectedVersion: 2 });
    expect((await order(head)).slice(0, 3)).toEqual([b, c, a]);
    const rows = await fx.auditOf('outline.materialized', 'outline.moved');
    expect(rows.map((r) => r.action)).toEqual([
      'outline.materialized',
      'outline.moved',
      'outline.moved',
    ]);
  });

  it('records the direction, section and the new position, ids only', async () => {
    const head = await fx.headmaster();
    const target = SEED_OUTLINE.pokyny[2]!.lineageId;
    await move(head, target, 'up');
    const [moved] = await fx.auditOf('outline.moved');
    expect(moved?.data).toEqual({
      meta: {
        monday: monday(WEEK_1),
        lineageId: target,
        direction: 'up',
        section: 'pokyny',
        position: 1,
      },
    });
  });

  it('changes nothing at the edge of the section, but still takes the version', async () => {
    const head = await fx.headmaster();
    const before = await order(head);
    expect(await move(head, before[0]!, 'up')).toEqual({
      ok: true,
      value: { version: 2, lineageId: before[0] },
    });
    expect(await move(head, before.at(-1)!, 'down', { expectedVersion: 2 })).toMatchObject({
      ok: true,
      value: { version: 3 },
    });
    expect(await order(head)).toEqual(before);
  });

  it('keeps an item inside its own section', async () => {
    const head = await fx.headmaster();
    const only = SEED_OUTLINE.hospodareni[0]!.lineageId;
    const pokyny = await order(head);
    await move(head, only, 'up');
    expect(await order(head, 'hospodareni')).toEqual([only]);
    expect(await order(head)).toEqual(pokyny);
  });

  it('places a newly approved proposal when it is moved, and stores it from then on', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal();
    const before = await order(head);
    expect(before.at(-1)).toBe(pointId);

    await move(head, pointId, 'up');
    const after = await order(head);
    expect(after.at(-2)).toBe(pointId);
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.pokyny.find((r) => r.lineageId === pointId)?.proposal).toEqual({
      pointId,
      isNew: false,
    });
    const issue = await fx.issueOf(WEEK_1);
    const stored = await world.tx(
      world.as(head),
      (tx) => tx.issueItems.forIssue(issue!.id),
      'read',
    );
    expect(stored.pokyny.filter((r) => r.sourcePointId === pointId)).toHaveLength(1);
  });

  it('refuses an unknown item as item-missing', async () => {
    const head = await fx.headmaster();
    expect(await move(head, randomUUID(), 'up')).toEqual(rule('item-missing'));
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_1, 'Pokyn');
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit(), await order(head)];
    expect(await move(head, id, 'up', { expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit(), await order(head)]).toEqual(
      before,
    );
  });

  it('refuses a skipped porada as issue-not-open', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_2, 'Pokyn');
    await world.run(setSkipped, world.as(head), {
      monday: monday(WEEK_2),
      event: 'skip',
      confirmed: true,
      expectedVersion: 2,
    });
    expect(await move(head, id, 'up', { monday: monday(WEEK_2), expectedVersion: 3 })).toEqual(
      rule('issue-not-open'),
    );
  });

  it.each([['a direction that is neither'], ['']])(
    'refuses the direction %j',
    async (direction) => {
      const head = await fx.headmaster();
      expect(await move(head, SEED_OUTLINE.pokyny[0]!.lineageId, direction)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    },
  );
});
