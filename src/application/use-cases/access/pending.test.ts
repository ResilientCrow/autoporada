import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { pendingAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);

const queueOf = async (user: UserRecord) => {
  const result = await world.run(pendingAccess, world.as(user), {});
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value.items;
};

describe('access.pending', () => {
  it('lists the requests oldest first with the requester’s details', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const first = await world.seed.user({ role: 'pending', displayName: 'Alena Nová' });
    const second = await world.seed.user({ role: 'pending', displayName: 'Bohdan Starý' });
    const third = await world.seed.user({ role: 'pending', displayName: 'Cyril Mladý' });
    const newest = await world.seed.accessRequest({
      userId: third.id,
      state: 'pending',
      createdAt: daysAgo(1),
    });
    const oldest = await world.seed.accessRequest({
      userId: first.id,
      state: 'pending',
      createdAt: daysAgo(5),
    });
    const middle = await world.seed.accessRequest({
      userId: second.id,
      state: 'pending',
      createdAt: daysAgo(3),
    });
    const items = await queueOf(head);
    expect(items.map((i) => i.requestId)).toEqual([oldest.id, middle.id, newest.id]);
    expect(items[0]).toEqual({
      requestId: oldest.id,
      version: oldest.version,
      userId: first.id,
      displayName: 'Alena Nová',
      email: null,
      jobTitle: null,
      department: null,
      reason: oldest.reason,
      requestedAt: daysAgo(5).toISOString(),
      events: ['approve', 'reject', 'block'],
    });
  });

  it('carries email, job title and department when the user has them', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    await world.tx(system('test.seed'), (tx) =>
      tx.users.upsertFromClaims({
        tid: user.tid,
        oid: user.oid,
        displayName: user.displayName,
        email: 'jana@skola.example',
        jobTitle: 'Učitelka',
        department: 'Fyzika',
      }),
    );
    await world.seed.accessRequest({ userId: user.id, state: 'pending' });
    const [item] = await queueOf(head);
    expect(item).toMatchObject({
      email: 'jana@skola.example',
      jobTitle: 'Učitelka',
      department: 'Fyzika',
    });
  });

  it('leaves out decided and cancelled requests', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const a = await world.seed.user({ role: 'pending' });
    const b = await world.seed.user({ role: 'pending' });
    const c = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({ userId: a.id, state: 'cancelled' });
    await world.seed.accessRequest({ userId: b.id, state: 'rejected', decidedBy: head.id });
    await world.seed.accessRequest({ userId: c.id, state: 'blocked', decidedBy: head.id });
    expect(await queueOf(head)).toEqual([]);
  });

  it('is empty when nobody is waiting, and writes no audit row', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const waiting = await world.seed.user({ role: 'pending' });
    expect(await queueOf(head)).toEqual([]);
    await world.seed.accessRequest({ userId: waiting.id, state: 'pending' });
    expect(await queueOf(head)).toHaveLength(1);
    expect(await world.inspect.audit()).toEqual([]);
  });

  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    await world.seed.accessRequest({ userId: user.id, state: 'pending' });
    expect(await world.run(pendingAccess, world.as(user), {})).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });
});
