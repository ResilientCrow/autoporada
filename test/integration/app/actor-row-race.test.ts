import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { changeUserAccess, decideAccess } from '@/application/use-cases';

import { setupWorld } from '../../support/world';

const world = setupWorld();
const WAIT_MS = 2_000;

/** Resolves once another transaction waits on a lock, or after WAIT_MS if none ever does. */
async function untilSomeoneWaits(): Promise<void> {
  const { pg } = world;
  if (!pg) throw new Error('untilSomeoneWaits: PostgreSQL only');
  for (const start = Date.now(); Date.now() - start < WAIT_MS;) {
    if ((await pg.lockWaits()) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Demotes `head` in a transaction that stays open until `act` waits on a
 * lock, then commits. A use case that only read head's row would have
 * finished as the headmaster the session still names.
 */
async function whileDemoting<T>(head: UserRecord, act: () => Promise<T>): Promise<T> {
  let locked: () => void = () => undefined;
  const headLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const demotion = world.tx(system('test.seed'), async (tx) => {
    await tx.users.changeAccess(head.id, head.version, { role: 'reviewer' });
    locked();
    await untilSomeoneWaits();
  });
  await headLocked;
  const [result] = await Promise.all([act(), demotion]);
  return result;
}

describe('a headmaster demoted while their write waits on their row', () => {
  it('cannot change a user', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const result = await whileDemoting(head, () =>
      world.run(changeUserAccess, world.as(head), {
        userId: user.id,
        version: user.version,
        role: 'reviewer',
        tier: null,
        status: 'active',
      }),
    );
    expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    const after = await world.tx(system('test.seed'), (tx) => tx.users.get(user.id), 'read');
    expect(after?.role).toBe('submitter');
  });

  it('cannot decide a request', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const request = await world.seed.accessRequest({ userId: user.id, state: 'pending' });
    const result = await whileDemoting(head, () =>
      world.run(decideAccess, world.as(head), {
        requestId: request.id,
        version: request.version,
        decision: 'approve',
        tier: 'ucitel',
      }),
    );
    expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    const after = await world.tx(system('test.seed'), (tx) => tx.users.get(user.id), 'read');
    expect(after?.role).toBe('pending');
  });
});
