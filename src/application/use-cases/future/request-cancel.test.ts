import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { requestCancelFuture } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const ask = (by: UserRecord, id: string, over: Record<string, unknown> = {}) =>
  world.run(requestCancelFuture, world.as(by), {
    id,
    expectedVersion: 2,
    confirmed: true,
    ...over,
  });

/** An approved akce of the author's (version 2), then a minute passes. */
async function approved(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  await moveTo(author, id, 'approved');
  world.clock.advance(60_000);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

describe('future.requestCancel', () => {
  it('asks the vedení: the akce stays approved, the request in the history and the audit', async () => {
    const author = await user();
    const id = await approved(author);
    expect(await ask(author, id)).toEqual({ ok: true, value: { version: 3 } });
    const { item, events, audit } = await snapshot(id);
    expect(item).toMatchObject({
      state: 'approved',
      version: 3,
      cancelRequestedAt: world.clock.now(),
    });
    expect(events).toEqual([
      expect.objectContaining({
        event: 'request-cancel',
        fromState: 'approved',
        toState: 'approved',
        note: null,
        actorId: author.id,
      }),
    ]);
    expect(audit.at(-1)).toMatchObject({
      action: 'future.cancel-requested',
      targetType: 'future_item',
      targetId: id,
      data: {
        diff: { cancelRequestedAt: { from: null, to: world.clock.now().toISOString() } },
        meta: { kind: 'akce' },
      },
    });
  });

  it('needs the checkbox ticked', async () => {
    const author = await user();
    const id = await approved(author);
    await refuses(id, () => ask(author, id, { confirmed: false }), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
  });

  it('refuses a second request while one waits', async () => {
    const author = await user();
    const id = await approved(author);
    await ask(author, id);
    await refuses(id, () => ask(author, id, { expectedVersion: 3 }), { code: 'forbidden' });
  });

  // ADR 0062: the vedení cancels at once; they have nobody to ask.
  it.each(['reviewer', 'headmaster'] as const)('refuses a %s their own akce', async (role) => {
    const author = await user(role);
    const id = await approved(author);
    await refuses(id, () => ask(author, id), { code: 'forbidden' });
  });

  it.each(['draft', 'submitted', 'returned', 'rejected', 'withdrawn', 'cancelled'] as const)(
    'refuses an item that is %s',
    async (state: FutureState) => {
      const author = await user();
      const id = await start(author, 'akce');
      await moveTo(author, id, state);
      await refuses(id, () => ask(author, id), { code: 'forbidden' });
    },
  );

  it.each([
    ['a colleague', { role: 'submitter' }],
    ['a reviewer', { role: 'reviewer' }],
  ] as const)('does not find the akce for %s', async (_who, seed) => {
    const id = await approved(await user());
    await refuses(id, async () => ask(await world.seed.user(seed), id), { code: 'not-found' });
  });

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const id = await approved(author);
    await refuses(id, () => ask(author, id, { expectedVersion: 1 }), { code: 'conflict' });
  });
});
