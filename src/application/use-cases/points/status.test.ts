import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { pointFixtures, readyProposal } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { pointStatus, submitPoint } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const status = (by: UserRecord, id: string) => world.run(pointStatus, world.as(by), { id });
const notFound = { ok: false, error: { code: 'not-found' } };

describe('points.status', () => {
  it('tells the author of a draft its version and that they may edit it', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    expect(await status(author, id)).toEqual({
      ok: true,
      value: { version: 1, state: 'draft', editable: true },
    });
  });

  it.each([
    ['returned', true],
    ['submitted', false],
    ['approved', false],
    ['rejected', false],
    ['withdrawn', false],
    ['published', false],
  ] as const)(
    'tells the author of a %s point whether they may edit it',
    async (state, editable) => {
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, state);
      expect(await status(author, id)).toEqual({
        ok: true,
        value: { version: 2, state, editable },
      });
    },
  );

  it('tells a reviewer reading a submitted point that it is not theirs to edit', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    const input = { id, expectedVersion: 1, content: readyProposal() };
    expect((await world.run(submitPoint, world.as(author), input)).ok).toBe(true);
    expect(await status(await user('reviewer'), id)).toEqual({
      ok: true,
      value: { version: 2, state: 'submitted', editable: false },
    });
  });

  it('does not find a colleague’s draft for a reviewer, nor an unknown point', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    expect(await status(await user('reviewer'), id)).toEqual(notFound);
    expect(await status(author, randomUUID())).toEqual(notFound);
  });

  it('does not find their own point for an author whose account went back to pending', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    const pending = await world.tx(system('test.seed'), (tx) =>
      tx.users.changeAccess(author.id, author.version, { role: 'pending' }),
    );
    expect(await status(pending, id)).toEqual(notFound);
  });

  it('writes nothing', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    const before = await snapshot(id);
    await status(author, id);
    expect(await snapshot(id)).toEqual(before);
  });
});
