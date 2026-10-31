import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { moveList } from './index';

const world = setupWorld();
const { people, list, lists } = registryFixtures(world);

async function three() {
  const head = await people.headmaster();
  // positions with gaps, as a deleted list would leave them
  const a = await list('A', { position: 2 });
  const b = await list('B', { position: 5 });
  const c = await list('C', { position: 9 });
  const move = (id: string, direction: 'up' | 'down') =>
    world.run(moveList, world.as(head), { id, direction });
  const order = async () => (await lists()).map((l) => l.title);
  return { head, a, b, c, move, order };
}

describe('registry.moveList', () => {
  it('moves a list one place down and writes the positions as 1..n', async () => {
    const { head, a, move, order } = await three();
    expect(await move(a.id, 'down')).toEqual({ ok: true, value: { moved: true } });
    expect(await order()).toEqual(['B', 'A', 'C']);
    expect((await lists()).map((l) => l.position)).toEqual([1, 2, 3]);
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.list_moved',
      targetType: 'registry_list',
      targetId: a.id,
      data: { meta: { direction: 'down' } },
    });
  });

  it('moves a list up', async () => {
    const { c, move, order } = await three();
    expect(await move(c.id, 'up')).toEqual({ ok: true, value: { moved: true } });
    expect(await order()).toEqual(['A', 'C', 'B']);
  });

  it('answers moved: false for the first going up and the last going down, writing nothing', async () => {
    const { a, c, move, order } = await three();
    const before = await lists();
    expect(await move(a.id, 'up')).toEqual({ ok: true, value: { moved: false } });
    expect(await move(c.id, 'down')).toEqual({ ok: true, value: { moved: false } });
    expect(await lists()).toEqual(before);
    expect(await order()).toEqual(['A', 'B', 'C']);
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('keeps the whole order through repeated moves', async () => {
    const { a, move, order } = await three();
    await move(a.id, 'down');
    await move(a.id, 'down');
    await move(a.id, 'down');
    expect(await order()).toEqual(['B', 'C', 'A']);
  });

  it('answers not-found for an unknown list', async () => {
    const { move } = await three();
    expect(await move('0198f000-0000-7000-8000-00000000ffff', 'up')).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('refuses another direction as invalid input', async () => {
    const { head, a } = await three();
    const result = await world.run(moveList, world.as(head), { id: a.id, direction: 'left' });
    expect(!result.ok && result.error.code).toBe('invalid-input');
  });

  it('is for the headmaster alone', async () => {
    const { a, order } = await three();
    for (const who of [people.reviewer, people.submitter]) {
      const result = await world.run(moveList, world.as(await who()), {
        id: a.id,
        direction: 'down',
      });
      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
    expect(await order()).toEqual(['A', 'B', 'C']);
  });
});
