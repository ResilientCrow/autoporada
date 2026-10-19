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
    await world.tx(cli, async (tx) => {
      const session = await tx.sessions.create({
        tokenSha256: sha('first'),
        userId: user.id,
        authTime: world.clock.now(),
        ...newSessionTimes(world.clock.now()),
      });
      await tx.audit.record({ action: 'auth.login', target: { type: 'session', id: session.id } });
    });
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
});
