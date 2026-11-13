import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { DRAFT_CAP } from '@/domain/report';

import { FIRST_MONDAY, pointFixtures, readyProposal } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { retractPoint, savePoint, submitPoint, withdrawPoint } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = pointFixtures(world);

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
  it('takes a submitted point back to the drafts: no longer handed in, its Monday kept', async () => {
    const author = await user();
    const id = await submitted(author);
    world.clock.advance(60_000);
    expect(await retract(author, id)).toEqual({ ok: true, value: { version: 3 } });
    expect(await get(author, id)).toMatchObject({
      state: 'draft',
      version: 3,
      earliestMonday: FIRST_MONDAY,
      submittedAt: null,
      handInMonday: null,
      content: { title: 'Nákup projektoru' },
    });
  });

  it('lets a resubmit set when the point was handed in again', async () => {
    const author = await user();
    const id = await submitted(author);
    await retract(author, id);
    world.clock.advance(60_000);
    const again = await world.run(submitPoint, world.as(author), {
      id,
      expectedVersion: 3,
      content: readyProposal(),
    });
    expect(again).toEqual({ ok: true, value: { version: 4 } });
    expect(await get(author, id)).toMatchObject({
      state: 'submitted',
      earliestMonday: FIRST_MONDAY,
      handInMonday: FIRST_MONDAY,
      submittedAt: world.clock.now(),
    });
  });

  it('keeps a draft rewritten after a retract and then withdrawn from reviewers', async () => {
    const author = await user();
    const id = await submitted(author);
    await retract(author, id);
    const rewritten = readyProposal({ title: 'Jiný návrh' });
    const saved = await world.run(savePoint, world.as(author), {
      id,
      expectedVersion: 3,
      content: rewritten,
    });
    expect(saved.ok).toBe(true);
    const gone = await world.run(withdrawPoint, world.as(author), {
      id,
      expectedVersion: 4,
      confirmed: true,
    });
    expect(gone).toEqual({ ok: true, value: { version: 5 } });
    for (const role of ['reviewer', 'headmaster'] as const) {
      const by = await user(role);
      expect(await get(by, id), role).toBeNull();
    }
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
      data: {
        diff: {
          state: { from: 'submitted', to: 'draft' },
          submittedAt: { from: world.clock.now().toISOString(), to: null },
          handInMonday: { from: '2026-10-26', to: null },
        },
        meta: { kind: 'pokyn' },
      },
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
