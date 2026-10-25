import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { DRAFT_CAP } from '@/domain/report';

import { FIRST_MONDAY, pointFixtures, readyProposal, START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { retractPoint, submitPoint } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = pointFixtures(world);
beforeEach(() => world.clock.set(START));

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const retract = (by: UserRecord, id: string, expectedVersion = 2) =>
  world.run(retractPoint, world.as(by), { id, expectedVersion });

/** A pokyn of the author's, submitted through the use case: version 2. */
async function submitted(author: UserRecord): Promise<string> {
  const id = await start(author, 'pokyn');
  const result = await world.run(submitPoint, world.as(author), {
    id,
    expectedVersion: 1,
    content: readyProposal(),
  });
  if (!result.ok) throw new Error(`submit refused: ${result.error.code}`);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const forbidden = { code: 'forbidden' };

describe('points.retract', () => {
  it('takes a submitted point back to the drafts and keeps when it was handed in', async () => {
    const author = await user();
    const id = await submitted(author);
    const submittedAt = world.clock.now();
    world.clock.advance(60_000);
    expect(await retract(author, id)).toEqual({ ok: true, value: { version: 3 } });
    expect(await get(author, id)).toMatchObject({
      state: 'draft',
      version: 3,
      earliestMonday: FIRST_MONDAY,
      submittedAt,
      content: { title: 'Nákup projektoru' },
    });
  });

  it('records point.retracted with the states, and the point event', async () => {
    const author = await user();
    const id = await submitted(author);
    await retract(author, id);
    const { audit, events } = await snapshot(id);
    expect(audit.at(-1)).toEqual({
      actorId: author.id,
      action: 'point.retracted',
      targetType: 'point',
      targetId: id,
      data: { diff: { state: { from: 'submitted', to: 'draft' } }, meta: { kind: 'pokyn' } },
      requestId: 'test',
    });
    expect(events[0]).toMatchObject({ event: 'retract', fromState: 'submitted', toState: 'draft' });
  });

  it('takes a point back even when the author already holds the most drafts', async () => {
    const author = await user();
    const id = await submitted(author);
    for (let i = 0; i < DRAFT_CAP; i++) await start(author, 'pokyn');
    expect(await retract(author, id)).toEqual({ ok: true, value: { version: 3 } });
  });

  it('hides the point from reviewers again: it is a draft', async () => {
    const author = await user();
    const id = await submitted(author);
    const reviewer = await user('reviewer');
    expect(await get(reviewer, id)).not.toBeNull();
    await retract(author, id);
    expect(await get(reviewer, id)).toBeNull();
  });

  it.each(['draft', 'returned', 'approved', 'rejected', 'withdrawn', 'published'] as const)(
    'refuses a %s point',
    async (state) => {
      const author = await user();
      const id = await start(author, 'pokyn');
      if (state !== 'draft') await moveTo(author, id, state);
      const version = state === 'draft' ? 1 : 2;
      await refuses(id, () => retract(author, id, version), forbidden);
    },
  );

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const id = await submitted(author);
    await refuses(id, () => retract(author, id, 1), { code: 'conflict' });
  });

  it('refuses a reviewer who is not the author', async () => {
    const author = await user();
    const id = await submitted(author);
    const reviewer = await user('reviewer');
    await refuses(id, () => retract(reviewer, id), forbidden);
  });

  it('does not find a colleague’s draft', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    const headmaster = await user('headmaster');
    await refuses(id, () => retract(headmaster, id, 1), {
      code: 'not-found',
    });
  });

  it('cannot run for the system', async () => {
    await expect(
      world.run(retractPoint, system('cli:test'), { id: randomUUID(), expectedVersion: 1 }),
    ).rejects.toThrow('points.retract: runs as a signed-in user');
  });
});
