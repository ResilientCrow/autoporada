import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { retractFuture, submitFuture } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const retract = (by: UserRecord, id: string, expectedVersion = 2) =>
  world.run(retractFuture, world.as(by), { id, expectedVersion });

/** An akce of the author's, submitted through the use case: version 2. */
async function submitted(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  const result = await world.run(submitFuture, world.as(author), {
    id,
    expectedVersion: 1,
    content: readyAkce(),
  });
  if (!result.ok) throw new Error(`submit refused: ${result.error.code}`);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

describe('future.retract', () => {
  it('takes a submitted item back to the drafts, no longer handed in', async () => {
    const author = await user();
    const id = await submitted(author);
    world.clock.advance(60_000);
    expect(await retract(author, id)).toEqual({ ok: true, value: { version: 3 } });
    expect(await get(author, id)).toMatchObject({
      state: 'draft',
      version: 3,
      submittedAt: null,
      content: { title: 'Výlet do Prahy' },
    });
    const { events, audit } = await snapshot(id);
    // Newest first.
    expect(events.map((e) => [e.event, e.fromState, e.toState])).toEqual([
      ['retract', 'submitted', 'draft'],
      ['submit', 'draft', 'submitted'],
    ]);
    expect(audit.at(-1)).toMatchObject({
      action: 'future.retracted',
      targetType: 'future_item',
      targetId: id,
      data: {
        diff: {
          state: { from: 'submitted', to: 'draft' },
          submittedAt: { from: expect.any(String), to: null },
        },
        meta: { kind: 'akce' },
      },
    });
  });

  it('answers a stale page with a conflict', async () => {
    const author = await user();
    const id = await submitted(author);
    await refuses(id, () => retract(author, id, 1), { code: 'conflict' });
  });

  it.each(['draft', 'returned', 'approved', 'rejected', 'withdrawn', 'cancelled'] as const)(
    'refuses the author on a %s item',
    async (state: FutureState) => {
      const author = await user();
      const id = await start(author, 'akce');
      await moveTo(author, id, state);
      await refuses(id, () => retract(author, id), { code: 'forbidden' });
    },
  );

  // The port's write scope is the author's (F3): what a reader may see is not theirs to lock.
  it('does not find a submitted item for a reviewer', async () => {
    const author = await user();
    const id = await submitted(author);
    const reviewer = await user('reviewer');
    await refuses(id, () => retract(reviewer, id), { code: 'not-found' });
  });

  it.each([
    ['a colleague', { role: 'submitter' }],
    ['a student', { role: 'submitter', isStudent: true }],
  ] as const)('does not find a submitted item for %s', async (_who, seed) => {
    const author = await user();
    const id = await submitted(author);
    const other = await world.seed.user(seed);
    await refuses(id, () => retract(other, id), { code: 'not-found' });
  });

  it('does not find an approved akce for a colleague', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await moveTo(author, id, 'approved');
    const colleague = await user();
    await refuses(id, () => retract(colleague, id), { code: 'not-found' });
  });
});
