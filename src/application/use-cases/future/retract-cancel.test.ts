import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';

import { futureFixtures } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { requestCancelFuture, retractCancelFuture } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const takeBack = (by: UserRecord, id: string, expectedVersion = 3) =>
  world.run(retractCancelFuture, world.as(by), { id, expectedVersion });

/** An approved akce of the author's whose cancel they asked for (version 3), then a minute passes. */
async function asked(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  await moveTo(author, id, 'approved');
  const result = await world.run(requestCancelFuture, world.as(author), {
    id,
    expectedVersion: 2,
    confirmed: true,
  });
  if (!result.ok) throw new Error(`request refused: ${result.error.code}`);
  world.clock.advance(60_000);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

describe('future.retractCancel', () => {
  it('takes the request back: approved as before, in the history and the audit', async () => {
    const author = await user();
    const id = await asked(author);
    expect(await takeBack(author, id)).toEqual({ ok: true, value: { version: 4 } });
    const { item, events, audit } = await snapshot(id);
    expect(item).toMatchObject({ state: 'approved', version: 4, cancelRequestedAt: null });
    expect(events.map((e) => [e.event, e.fromState, e.toState, e.actorId])).toEqual([
      ['retract-cancel', 'approved', 'approved', author.id],
      ['request-cancel', 'approved', 'approved', author.id],
    ]);
    expect(audit.at(-1)).toMatchObject({
      action: 'future.cancel-retracted',
      targetId: id,
      data: {
        diff: { cancelRequestedAt: { from: expect.any(String), to: null } },
        meta: { kind: 'akce' },
      },
    });
  });

  it('refuses an approved akce with no request waiting', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await moveTo(author, id, 'approved');
    await refuses(id, () => takeBack(author, id, 2), { code: 'forbidden' });
  });

  it.each([
    ['a colleague', { role: 'submitter' }],
    ['a reviewer', { role: 'reviewer' }],
  ] as const)('does not find the request for %s', async (_who, seed) => {
    const id = await asked(await user());
    await refuses(id, async () => takeBack(await world.seed.user(seed), id), {
      code: 'not-found',
    });
  });

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const id = await asked(author);
    await refuses(id, () => takeBack(author, id, 2), { code: 'conflict' });
  });
});
