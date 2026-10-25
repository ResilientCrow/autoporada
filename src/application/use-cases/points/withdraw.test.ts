import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { PointState } from '@/domain/review';

import { pointFixtures, readyProposal } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { submitPoint, withdrawPoint } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const withdraw = (
  by: UserRecord,
  id: string,
  expectedVersion: number,
  extra: Record<string, unknown> = { confirmed: true },
) => world.run(withdrawPoint, world.as(by), { id, expectedVersion, ...extra });

/** A pokyn of the author's in `state` and its version: submitted through the use case. */
async function pointIn(author: UserRecord, state: PointState): Promise<[string, number]> {
  const id = await start(author, 'pokyn');
  if (state === 'draft') return [id, 1];
  const result = await world.run(submitPoint, world.as(author), {
    id,
    expectedVersion: 1,
    content: readyProposal(),
  });
  if (!result.ok) throw new Error(`submit refused: ${result.error.code}`);
  if (state === 'submitted') return [id, 2];
  await moveTo(author, id, state);
  return [id, 3];
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const forbidden = { code: 'forbidden' };

describe('points.withdraw', () => {
  it.each(['draft', 'returned', 'submitted'] as const)(
    'withdraws a %s point and records it',
    async (from) => {
      const author = await user();
      const [id, version] = await pointIn(author, from);
      expect(await withdraw(author, id, version)).toEqual({
        ok: true,
        value: { version: version + 1 },
      });
      const { point, audit, events } = await snapshot(id);
      expect(point).toMatchObject({ state: 'withdrawn', version: version + 1 });
      expect(audit.at(-1)).toEqual({
        actorId: author.id,
        action: 'point.withdrawn',
        targetType: 'point',
        targetId: id,
        data: { diff: { state: { from, to: 'withdrawn' } }, meta: { kind: 'pokyn' } },
        requestId: 'test',
      });
      expect(events[0]).toMatchObject({ event: 'withdraw', fromState: from, toState: 'withdrawn' });
    },
  );

  it('withdraws a draft never handed in without a submit time, unseen by reviewers', async () => {
    const author = await user();
    const [id] = await pointIn(author, 'draft');
    await withdraw(author, id, 1);
    expect((await get(author, id))?.submittedAt).toBeNull();
    expect(await get(await user('reviewer'), id)).toBeNull();
  });

  it('keeps a point once handed in readable to reviewers', async () => {
    const author = await user();
    const [id] = await pointIn(author, 'submitted');
    await withdraw(author, id, 2);
    expect(await get(await user('reviewer'), id)).toMatchObject({ state: 'withdrawn' });
  });

  it.each([
    ['unchecked', { confirmed: false }],
    ['missing', {}],
  ])('refuses without the confirmation (%s) and writes nothing', async (_case, extra) => {
    const author = await user();
    const [id] = await pointIn(author, 'submitted');
    await refuses(id, () => withdraw(author, id, 2, extra), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
  });

  it.each(['approved', 'rejected', 'withdrawn', 'published'] as const)(
    'refuses a %s point',
    async (state) => {
      const author = await user();
      const [id, version] = await pointIn(author, state);
      await refuses(id, () => withdraw(author, id, version), forbidden);
    },
  );

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const [id] = await pointIn(author, 'submitted');
    await refuses(id, () => withdraw(author, id, 1), { code: 'conflict' });
  });

  it('refuses a reviewer who is not the author', async () => {
    const author = await user();
    const [id] = await pointIn(author, 'submitted');
    const reviewer = await user('reviewer');
    await refuses(id, () => withdraw(reviewer, id, 2), forbidden);
  });

  it('does not find a colleague’s draft', async () => {
    const author = await user();
    const [id] = await pointIn(author, 'draft');
    const headmaster = await user('headmaster');
    await refuses(id, () => withdraw(headmaster, id, 1), {
      code: 'not-found',
    });
  });

  it('cannot run for the system', async () => {
    const input = { id: randomUUID(), expectedVersion: 1, confirmed: true };
    await expect(world.run(withdrawPoint, system('cli:test'), input)).rejects.toThrow(
      'points.withdraw: runs as a signed-in user',
    );
  });
});
