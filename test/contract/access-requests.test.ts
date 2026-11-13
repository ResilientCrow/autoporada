import { describe, expect, it } from 'vitest';

import {
  ScopeViolation,
  StaleVersion,
  system,
  type AccessRequestRecord,
  type Principal,
  type Tx,
  type UserRecord,
} from '@/application/ports';

import { erasureRefusedBy, setupWorld } from '../support/world';

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
  to: 'approved' | 'blocked' | 'cancelled' | 'rejected',
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

  it('lists a user’s requests newest first', async () => {
    const me = await world.seed.user({ role: 'pending' });
    const other = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    const first = await request(me);
    await move(world.as(me), first, 'cancelled');
    world.clock.advance(60_000);
    await request(other);
    world.clock.advance(60_000);
    const third = await request(me);
    const history = await world.tx(
      world.as(head),
      async (tx) => (await tx.accessRequests.forUser(me.id)).map((r) => r.id),
      'read',
    );
    expect(history).toEqual([third.id, first.id]);
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

  it('keeps a user who decided a request: erasing them is refused', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    await move(world.as(head), await request(user), 'approved');
    await expect(world.erase.user(head.id)).rejects.toMatchObject(
      erasureRefusedBy(world.kind, 'access_requests_decided_by_users_id_fk'),
    );
    await expect(world.erase.user(user.id)).resolves.toBeUndefined();
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

  it.each(['approved', 'rejected', 'blocked'] as const)(
    'refuses a system principal a decision (%s): decisions are a headmaster’s',
    async (to) => {
      const user = await world.seed.user({ role: 'pending' });
      const head = await world.seed.user({ role: 'headmaster' });
      const created = await request(user);
      await expect(move(system('cli:test'), created, to)).rejects.toBeInstanceOf(ScopeViolation);
      const row = await world.tx(world.as(head), (tx) => tx.accessRequests.get(created.id), 'read');
      expect(row).toEqual(created);
    },
  );

  it('lets a person have one pending request at a time', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const other = await world.seed.user({ role: 'pending' });
    await request(user);
    await expect(request(user)).rejects.toMatchObject({
      name: 'ConstraintViolation',
      constraint: 'access_requests_one_pending',
    });
    await expect(request(other)).resolves.toMatchObject({ state: 'pending' });
  });

  it('lets them ask again once the request is decided', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const head = await world.seed.user({ role: 'headmaster' });
    await move(world.as(head), await request(user), 'rejected');
    await expect(request(user)).resolves.toMatchObject({ state: 'pending', version: 1 });
  });
});

describe('AccessRequestRepo countPendingSince (what the reviewer digest reads)', () => {
  const asWorker = <T>(work: (tx: Tx) => Promise<T>) =>
    world.workerDb.transaction(
      { principal: system('job:reviewer.digest'), now: world.clock.now(), requestId: 'test' },
      { mode: 'read' },
      work,
    );
  const SINCE = new Date('2026-10-19T12:00:00Z');
  const count = () => asWorker((tx) => tx.accessRequests.countPendingSince(SINCE));
  /** Files a request for a new pending user at `at`. */
  const fileAt = async (at: string) => {
    world.clock.set(new Date(at));
    const user = await world.seed.user({ role: 'pending' });
    return { user, filed: await request(user) };
  };

  it('counts the requests still pending that were filed after the instant, not those before or at it', async () => {
    await fileAt('2026-10-19T11:59:59Z');
    await fileAt('2026-10-19T12:00:00Z');
    await fileAt('2026-10-19T12:00:01Z');
    await fileAt('2026-10-20T08:00:00Z');
    expect(await count()).toBe(2);
  });

  it('leaves out the requests that are decided or cancelled', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const approved = await fileAt('2026-10-19T13:00:00Z');
    const cancelled = await fileAt('2026-10-19T14:00:00Z');
    await fileAt('2026-10-19T15:00:00Z');
    await move(world.as(head), approved.filed, 'approved');
    await move(world.as(cancelled.user), cancelled.filed, 'cancelled');
    expect(await count()).toBe(1);
  });

  it('refuses a user, a headmaster included: the digest job reads it', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const refused = world
      .tx(world.as(head), (tx) => tx.accessRequests.countPendingSince(SINCE), 'read')
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(await refused).toBeInstanceOf(ScopeViolation);
  });
});
