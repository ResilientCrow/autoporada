import { describe, expect, it } from 'vitest';

import {
  ScopeViolation,
  StaleVersion,
  system,
  type AccessRequestRecord,
  type Principal,
  type UserRecord,
} from '@/application/ports';

import { setupWorld } from '../support/world';

const world = setupWorld();

/** Files a request as `user` and records it, as a use case would. */
const request = (user: UserRecord, reason = 'Jsem nový učitel.') =>
  world.tx(world.as(user), async (tx) => {
    const created = await tx.accessRequests.create(user.id, reason);
    await tx.audit.record({
      action: 'access.request',
      target: { type: 'access_request', id: created.id },
    });
    return created;
  });

/** Moves a request on and records it. */
const move = (
  by: Principal,
  row: AccessRequestRecord,
  to: 'approved' | 'cancelled' | 'rejected',
  version = row.version,
) =>
  world.tx(by, async (tx) => {
    const after = await tx.accessRequests.transition(row.id, version, to);
    await tx.audit.record({
      action: 'access.decide',
      target: { type: 'access_request', id: row.id },
    });
    return after;
  });

describe('AccessRequestRepo (port contract)', () => {
  it('creates a pending request for the requester at the transaction’s instant', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const created = await request(user);
    expect(created).toEqual({
      id: created.id,
      userId: user.id,
      reason: 'Jsem nový učitel.',
      state: 'pending',
      decidedBy: null,
      decidedAt: null,
      version: 1,
      createdAt: world.clock.now(),
    });
  });

  it('lets only a user ask, only for themselves and only while pending', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const other = await world.seed.user({ role: 'pending' });
    const member = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    const create = (by: Principal, userId: string) =>
      world.tx(by, (tx) => tx.accessRequests.create(userId, 'x'));
    await expect(create(world.as(user), other.id)).rejects.toBeInstanceOf(ScopeViolation);
    await expect(create(world.as(member), member.id)).rejects.toBeInstanceOf(ScopeViolation);
    await expect(create(world.as(head), user.id)).rejects.toBeInstanceOf(ScopeViolation);
    await expect(create(system('cli:test'), user.id)).rejects.toBeInstanceOf(ScopeViolation);
  });

  it('shows a requester their own rows only and the headmaster all of them', async () => {
    const me = await world.seed.user({ role: 'pending' });
    const them = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const mine = await request(me);
    const theirs = await request(them);
    const sees = (who: UserRecord) =>
      world.tx(
        world.as(who),
        async (tx) => ({
          own: (await tx.accessRequests.get(mine.id))?.id ?? null,
          other: (await tx.accessRequests.get(theirs.id))?.id ?? null,
          ofOther: (await tx.accessRequests.forUser(them.id)).map((r) => r.id),
        }),
        'read',
      );
    expect(await sees(me)).toEqual({ own: mine.id, other: null, ofOther: [] });
    expect(await sees(head)).toEqual({ own: mine.id, other: theirs.id, ofOther: [theirs.id] });
  });

  it('lists a user’s requests newest first and the pending ones oldest first', async () => {
    const me = await world.seed.user({ role: 'pending' });
    const other = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const first = await request(me);
    await move(world.as(me), first, 'cancelled');
    world.clock.advance(60_000);
    const second = await request(other);
    world.clock.advance(60_000);
    const third = await request(me);
    const read = await world.tx(
      world.as(head),
      async (tx) => ({
        history: (await tx.accessRequests.forUser(me.id)).map((r) => r.id),
        pending: (await tx.accessRequests.pending()).map((r) => r.id),
      }),
      'read',
    );
    expect(read).toEqual({ history: [third.id, first.id], pending: [second.id, third.id] });
  });

  it('breaks ties on the creation instant by id', async () => {
    const a = await world.seed.user({ role: 'pending' });
    const b = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const one = await request(a);
    const two = await request(b);
    const ids = await world.tx(
      world.as(head),
      async (tx) => (await tx.accessRequests.pending()).map((r) => r.id),
      'read',
    );
    expect(ids).toEqual([one.id, two.id].sort());
  });

  it('lists the queue only for those who may decide', async () => {
    const user = await world.seed.user({ role: 'pending' });
    await expect(
      world.tx(world.as(user), (tx) => tx.accessRequests.pending(), 'read'),
    ).rejects.toBeInstanceOf(ScopeViolation);
  });

  it('records the decision, who made it and when, and raises the version', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const created = await request(user);
    world.clock.advance(5_000);
    const decided = await move(world.as(head), created, 'approved');
    expect(decided).toMatchObject({
      state: 'approved',
      decidedBy: head.id,
      decidedAt: world.clock.now(),
      version: 2,
    });
  });

  it('moves a request on only from the version it started from', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const created = await request(user);
    await move(world.as(head), created, 'rejected');
    await expect(move(world.as(head), created, 'approved')).rejects.toBeInstanceOf(StaleVersion);
    await expect(move(world.as(head), created, 'approved', 99)).rejects.toBeInstanceOf(
      StaleVersion,
    );
  });

  it('lets only the requester cancel, without a decider', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const other = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const created = await request(user);
    await expect(move(world.as(head), created, 'cancelled')).rejects.toBeInstanceOf(ScopeViolation);
    await expect(move(world.as(other), created, 'cancelled')).rejects.toBeInstanceOf(StaleVersion);
    expect(await move(world.as(user), created, 'cancelled')).toMatchObject({
      state: 'cancelled',
      decidedBy: null,
      decidedAt: world.clock.now(),
      version: 2,
    });
  });

  it('refuses decisions from anyone without access.decide', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const created = await request(user);
    for (const by of [user, reviewer]) {
      await expect(move(world.as(by), created, 'approved')).rejects.toBeInstanceOf(ScopeViolation);
    }
  });
});
