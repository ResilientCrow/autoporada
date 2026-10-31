import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ScopeViolation,
  StaleVersion,
  system,
  type Principal,
  type Tx,
  type UserRecord,
} from '@/application/ports';
import { newSessionTimes } from '@/domain/identity';

import { setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

/** Changes access and records it, as a use case would. */
const change = (
  by: Principal,
  user: UserRecord,
  patch: Parameters<Tx['users']['changeAccess']>[2],
  version = user.version,
) =>
  world.tx(by, async (tx) => {
    const after = await tx.users.changeAccess(user.id, version, patch);
    await tx.audit.record({ action: 'user.access.change', target: { type: 'user', id: user.id } });
    return after;
  });

/** A session for `user`, as the sign-in callback stores it. */
const signIn = (user: UserRecord, tokenSha256: string) =>
  world.tx(cli, async (tx) => {
    const session = await tx.sessions.create({
      tokenSha256,
      userId: user.id,
      authTime: world.clock.now(),
      ...newSessionTimes(world.clock.now()),
    });
    await tx.audit.record({ action: 'auth.login', target: { type: 'session', id: session.id } });
  });

describe('UserRepo (port contract)', () => {
  it('creates a user on first sign-in and later refreshes only the display fields', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer', displayName: 'Jana Nováková' });
    world.clock.advance(60_000);
    const again = await world.tx(cli, async (tx) => {
      const user = await tx.users.upsertFromClaims({
        tid: reviewer.tid,
        oid: reviewer.oid,
        displayName: 'Jana Svobodová',
        email: 'jana.svobodova@ssps.cz',
        jobTitle: 'učitelka',
        department: null,
      });
      await tx.audit.record({ action: 'auth.login', target: { type: 'user', id: user.id } });
      return user;
    });
    expect(again).toMatchObject({
      id: reviewer.id,
      displayName: 'Jana Svobodová',
      email: 'jana.svobodova@ssps.cz',
      role: 'reviewer',
      version: reviewer.version,
      updatedAt: world.clock.now(),
    });
  });

  it('lets only the system sign users in', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    const signIn = world.tx(world.as(user), (tx) =>
      tx.users.upsertFromClaims({
        tid: user.tid,
        oid: user.oid,
        displayName: 'x',
        email: null,
        jobTitle: null,
        department: null,
      }),
    );
    await expect(signIn).rejects.toBeInstanceOf(ScopeViolation);
  });

  it('shows submitters themselves, headmasters everyone and blocked users nobody', async () => {
    const me = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    const blocked = await world.seed.user({ role: 'reviewer', status: 'blocked' });
    const sees = (who: UserRecord) =>
      world.tx(
        world.as(who),
        async (tx) => ({
          list: (await tx.users.list()).map((u) => u.id),
          other: (await tx.users.get(head.id === who.id ? me.id : head.id))?.id ?? null,
        }),
        'read',
      );
    expect(await sees(me)).toEqual({ list: [me.id], other: null });
    expect(await sees(head)).toEqual({ list: [me.id, head.id, blocked.id].sort(), other: me.id });
    expect(await sees(blocked)).toEqual({ list: [], other: null });
  });

  it('changes access only from the version the change started from', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const after = await change(world.as(head), user, { role: 'reviewer' });
    expect(after).toMatchObject({ role: 'reviewer', version: user.version + 1 });
    await expect(change(world.as(head), user, { role: 'pending' })).rejects.toBeInstanceOf(
      StaleVersion,
    );
  });

  it('refuses access changes from anyone but a headmaster, even on themselves', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const user = await world.seed.user({ role: 'submitter' });
    await expect(change(world.as(reviewer), user, { role: 'reviewer' })).rejects.toBeInstanceOf(
      ScopeViolation,
    );
    await expect(change(world.as(user), user, { role: 'headmaster' })).rejects.toBeInstanceOf(
      ScopeViolation,
    );
  });

  it('never lets a headmaster change their own access', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    await expect(change(world.as(head), head, { role: 'reviewer' })).rejects.toBeInstanceOf(
      ScopeViolation,
    );
    await expect(change(world.as(head), head, { status: 'blocked' })).rejects.toBeInstanceOf(
      ScopeViolation,
    );
  });

  it('reads several users at once, within the principal’s scope', async () => {
    const me = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'reviewer' });
    const head = await world.seed.user({ role: 'headmaster' });
    const ids = [other.id, head.id, me.id];
    const read = (who: UserRecord, wanted: readonly string[]) =>
      world.tx(
        world.as(who),
        async (tx) => (await tx.users.getMany(wanted)).map((u) => u.id),
        'read',
      );
    expect(await read(head, ids)).toEqual([me.id, other.id, head.id].sort());
    expect(await read(me, ids)).toEqual([me.id]);
    expect(await read(head, [])).toEqual([]);
    expect(await read(head, [me.id, me.id])).toEqual([me.id]);
  });

  it('lists by role and status, and counts the active headmasters', async () => {
    await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster', status: 'blocked' });
    await world.seed.user({ role: 'reviewer' });
    const result = await world.tx(
      cli,
      async (tx) => ({
        heads: (await tx.users.list({ role: 'headmaster' })).length,
        blocked: (await tx.users.list({ status: 'blocked' })).length,
        active: await tx.users.countActiveHeadmasters(),
      }),
      'read',
    );
    expect(result).toEqual({ heads: 3, blocked: 1, active: 2 });
  });

  it('ends a user’s sessions when their access changes, not when their name does', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');
    const live = (token: string) =>
      world.tx(cli, async (tx) => (await tx.sessions.find(sha(token))) !== null, 'read');
    await signIn(user, sha('first'));
    await world.tx(cli, async (tx) => {
      await tx.users.upsertFromClaims({
        tid: user.tid,
        oid: user.oid,
        displayName: 'Nové jméno',
        email: null,
        jobTitle: null,
        department: null,
      });
      await tx.audit.record({ action: 'auth.login', target: { type: 'user', id: user.id } });
    });
    expect(await live('first')).toBe(true);
    const unchanged = await change(world.as(head), user, { role: 'submitter' });
    expect(await live('first')).toBe(true);
    await change(world.as(head), unchanged, { role: 'reviewer' });
    expect(await live('first')).toBe(false);
  });

  it.each([
    ['blocking them', { status: 'blocked' }],
    ['marking them a student', { isStudent: true }],
  ] as const)('ends a user’s sessions when %s', async (_name, patch) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const tokenSha256 = createHash('sha256').update('mine').digest('hex');
    await signIn(user, tokenSha256);
    await change(world.as(head), user, patch);
    expect(await world.tx(cli, (tx) => tx.sessions.find(tokenSha256), 'read')).toBeNull();
  });

  it('never lets a student have more than the submitter role', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    await expect(change(cli, user, { role: 'reviewer', isStudent: true })).rejects.toMatchObject({
      name: 'ConstraintViolation',
      constraint: 'users_student_role',
    });
    await expect(change(cli, user, { isStudent: true })).resolves.toMatchObject({
      isStudent: true,
    });
  });

  it.each([
    ['demoting', { role: 'reviewer' }],
    ['blocking', { status: 'blocked' }],
    ['deactivating', { status: 'deactivated' }],
  ] as const)(
    'keeps one active headmaster: %s the last one fails at commit',
    async (_name, patch) => {
      const head = await world.seed.user({ role: 'headmaster' });
      await expect(change(cli, head, patch)).rejects.toMatchObject({
        name: 'ConstraintViolation',
        constraint: 'users_active_headmaster',
      });
      expect(await world.tx(cli, (tx) => tx.users.get(head.id), 'read')).toMatchObject({
        role: 'headmaster',
        status: 'active',
      });
    },
  );

  it('allows demoting a headmaster while another stays active', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    await expect(change(cli, head, { role: 'reviewer' })).resolves.toMatchObject({
      role: 'reviewer',
    });
  });
});

describe('UserRepo.setReminders (port contract)', () => {
  const setOwn = (user: UserRecord, on: boolean, by: Principal = world.as(user)) =>
    world.tx(by, async (tx) => {
      const after = await tx.users.setReminders(user.id, on);
      await tx.audit.record({
        action: 'profile.reminders',
        target: { type: 'user', id: user.id },
        meta: { on },
      });
      return after;
    });

  it('changes the flag of the principal’s own row without bumping its version', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(user.remindDeadline).toBe(true);
    const off = await setOwn(user, false);
    expect(off).toMatchObject({
      remindDeadline: false,
      version: user.version,
      updatedAt: user.updatedAt,
    });
    expect(await setOwn(off, true)).toMatchObject({ remindDeadline: true, version: user.version });
  });

  it('leaves the user’s sessions alone', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const tokenSha256 = createHash('sha256').update('keep').digest('hex');
    await signIn(user, tokenSha256);
    await setOwn(user, false);
    expect(await world.tx(cli, (tx) => tx.sessions.find(tokenSha256), 'read')).not.toBeNull();
  });

  it('refuses to change anybody else’s flag, a headmaster’s too', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await expect(setOwn(user, false, world.as(head))).rejects.toBeInstanceOf(ScopeViolation);
    await expect(setOwn(user, false, cli)).rejects.toBeInstanceOf(ScopeViolation);
  });
});
