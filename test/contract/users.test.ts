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

  it('lets a headmaster change their own tier, and nothing else on their row with it', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    const after = await change(world.as(head), head, { tier: 'reditel' });
    expect(after).toMatchObject({ role: 'headmaster', tier: 'reditel', version: head.version + 1 });
    for (const patch of [
      { tier: 'vedeni', role: 'reviewer' },
      { tier: 'vedeni', status: 'blocked' },
    ] as const) {
      await expect(change(world.as(head), after, patch)).rejects.toBeInstanceOf(ScopeViolation);
    }
  });

  it('keeps the own tier from a student tier, by the role check', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await expect(change(world.as(head), head, { tier: 'student' })).rejects.toMatchObject({
      name: 'ConstraintViolation',
      constraint: 'users_student_role',
    });
  });

  it('lets nobody but a headmaster change even their own tier', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    await expect(change(world.as(reviewer), reviewer, { tier: 'vedeni' })).rejects.toBeInstanceOf(
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
    ['blocking them', {}, { status: 'blocked' }],
    ['marking them a student', {}, { tier: 'student' }],
    ['marking a teacher a student', { tier: 'ucitel' }, { tier: 'student' }],
    ['making a student staff again', { tier: 'student' }, { tier: 'zamestnanec' }],
  ] as const)('ends a user’s sessions when %s', async (_name, seed, patch) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter', ...seed });
    const tokenSha256 = createHash('sha256').update('mine').digest('hex');
    await signIn(user, tokenSha256);
    await change(world.as(head), user, patch);
    expect(await world.tx(cli, (tx) => tx.sessions.find(tokenSha256), 'read')).toBeNull();
  });

  it.each([
    ['a teacher joins vedení', { tier: 'ucitel' }, 'vedeni'],
    ['a student leaves school', { tier: 'student' }, 'absolvent'],
    ['a staff member gets a tier', {}, 'zamestnanec'],
  ] as const)('keeps a user’s sessions when %s', async (_name, seed, tier) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter', ...seed });
    const tokenSha256 = createHash('sha256').update('mine').digest('hex');
    await signIn(user, tokenSha256);
    await expect(change(world.as(head), user, { tier })).resolves.toMatchObject({ tier });
    expect(await world.tx(cli, (tx) => tx.sessions.find(tokenSha256), 'read')).not.toBeNull();
  });

  it('sets the tier, and starts with none', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    expect(user.tier).toBeNull();
    const after = await change(world.as(head), user, { tier: 'ucitel' });
    expect(after).toMatchObject({ tier: 'ucitel', version: user.version + 1 });
    expect(await world.tx(cli, (tx) => tx.users.get(user.id), 'read')).toMatchObject({
      tier: 'ucitel',
    });
  });

  it.each(['student', 'absolvent'] as const)(
    'never lets the tier %s have more than the submitter role',
    async (tier) => {
      const user = await world.seed.user({ role: 'submitter' });
      await expect(change(cli, user, { role: 'reviewer', tier })).rejects.toMatchObject({
        name: 'ConstraintViolation',
        constraint: 'users_student_role',
      });
      await expect(change(cli, user, { tier })).resolves.toMatchObject({ tier });
    },
  );

  it('lets a reviewer of any staff tier keep the role', async () => {
    const user = await world.seed.user({ role: 'reviewer' });
    await expect(change(cli, user, { tier: 'vedeni' })).resolves.toMatchObject({
      role: 'reviewer',
      tier: 'vedeni',
    });
  });

  it('never touches the tier on sign-in', async () => {
    const student = await world.seed.user({ role: 'submitter', tier: 'absolvent' });
    const again = await world.tx(cli, async (tx) => {
      const user = await tx.users.upsertFromClaims({
        tid: student.tid,
        oid: student.oid,
        displayName: 'Eva Malá',
        email: null,
        jobTitle: null,
        department: null,
      });
      await tx.audit.record({ action: 'auth.login', target: { type: 'user', id: user.id } });
      return user;
    });
    expect(again).toMatchObject({ tier: 'absolvent', version: student.version });
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

  describe('setAddress (ADR 0072 item 6)', () => {
    const ADDRESS = { salutation: 'pani', titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' } as const;
    const set = (by: Principal, id: string, patch: Parameters<Tx['users']['setAddress']>[1]) =>
      world.tx(by, async (tx) => {
        const after = await tx.users.setAddress(id, patch);
        await tx.audit.record({ action: 'user.address.change', target: { type: 'user', id } });
        return after;
      });
    const read = (id: string) => world.tx(cli, (tx) => tx.users.get(id), 'read');

    it('starts without an address', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      expect(user).toMatchObject({ salutation: null, titlesBefore: null, titlesAfter: null });
    });

    it('writes the own row, leaves the version and the access alone, and signs nobody out', async () => {
      const user = await world.seed.user({ role: 'reviewer', tier: 'vedeni' });
      await signIn(user, createHash('sha256').update('mine').digest('hex'));
      world.clock.advance(60_000);
      const after = await set(world.as(user), user.id, ADDRESS);
      expect(after).toMatchObject({
        ...ADDRESS,
        version: user.version,
        role: 'reviewer',
        tier: 'vedeni',
        status: 'active',
      });
      expect(await read(user.id)).toMatchObject(ADDRESS);
      const sha = createHash('sha256').update('mine').digest('hex');
      expect(await world.tx(cli, (tx) => tx.sessions.find(sha), 'read')).not.toBeNull();
    });

    it('clears a field when it is given as null', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      await set(world.as(user), user.id, ADDRESS);
      const after = await set(world.as(user), user.id, {
        salutation: 'pan',
        titlesBefore: null,
        titlesAfter: null,
      });
      expect(after).toMatchObject({ salutation: 'pan', titlesBefore: null, titlesAfter: null });
    });

    it('writes nobody else’s row, not even a headmaster’s', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      await expect(set(world.as(head), user.id, ADDRESS)).rejects.toBeInstanceOf(ScopeViolation);
      await expect(set(world.as(user), head.id, ADDRESS)).rejects.toBeInstanceOf(ScopeViolation);
      expect(await read(user.id)).toMatchObject({ salutation: null });
    });

    it('lets a pending user write theirs and a blocked one nothing', async () => {
      const pending = await world.seed.user({ role: 'pending' });
      await expect(set(world.as(pending), pending.id, ADDRESS)).resolves.toMatchObject(ADDRESS);
      const blocked = await world.seed.user({ role: 'submitter', status: 'blocked' });
      await expect(set(world.as(blocked), blocked.id, ADDRESS)).rejects.toBeInstanceOf(
        ScopeViolation,
      );
    });

    it('lets the system write only as a test seed', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      await expect(set(cli, user.id, ADDRESS)).rejects.toBeInstanceOf(ScopeViolation);
      await expect(set(system('auth.login'), user.id, ADDRESS)).rejects.toBeInstanceOf(
        ScopeViolation,
      );
      await expect(set(system('test.seed'), user.id, ADDRESS)).resolves.toMatchObject(ADDRESS);
    });

    it('is kept by a later sign-in, which refreshes the display fields only', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      await set(world.as(user), user.id, ADDRESS);
      const again = await world.tx(cli, async (tx) => {
        const row = await tx.users.upsertFromClaims({
          tid: user.tid,
          oid: user.oid,
          displayName: 'Jana Svobodová',
          email: null,
          jobTitle: null,
          department: null,
        });
        await tx.audit.record({ action: 'auth.login', target: { type: 'user', id: row.id } });
        return row;
      });
      expect(again).toMatchObject({ ...ADDRESS, displayName: 'Jana Svobodová' });
    });
  });
  describe('functions (ADR 0072 item 4)', () => {
    const MAJETEK = { head: 'zastupce', complement: 'pro majetek' } as const;
    const IT = { head: 'vedouci', complement: 'IT oddělení' } as const;
    const CLEN = { head: 'clen', complement: null } as const;
    const set = (
      by: Principal,
      user: UserRecord,
      list: Parameters<Tx['users']['setFunctions']>[2],
      version = user.version,
    ) =>
      world.tx(by, async (tx) => {
        const after = await tx.users.setFunctions(user.id, version, list);
        await tx.audit.record({
          action: 'user.functions.change',
          target: { type: 'user', id: user.id },
        });
        return after;
      });
    const read = (by: Principal, ids: readonly string[]) =>
      world.tx(by, (tx) => tx.users.functions(ids), 'read');

    it('starts with none, and a user without any is absent from the map', async () => {
      const user = await world.seed.user({ role: 'submitter' });
      expect((await read(cli, [user.id])).size).toBe(0);
      expect((await read(cli, [])).size).toBe(0);
    });

    it('keeps the order it was given, and a head without a complement', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      await set(world.as(head), user, [IT, CLEN, MAJETEK]);
      expect((await read(cli, [user.id])).get(user.id)).toEqual([IT, CLEN, MAJETEK]);
    });

    it('replaces the whole list, and an empty list removes it', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      const first = await set(world.as(head), user, [IT, CLEN]);
      const second = await set(world.as(head), first, [CLEN, CLEN, MAJETEK]);
      expect((await read(cli, [user.id])).get(user.id)).toEqual([CLEN, CLEN, MAJETEK]);
      await set(world.as(head), second, []);
      expect((await read(cli, [user.id])).has(user.id)).toBe(false);
    });

    it('bumps the version and touches nothing else on the row', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'reviewer', tier: 'vedeni' });
      await signIn(user, createHash('sha256').update('theirs').digest('hex'));
      const after = await set(world.as(head), user, [MAJETEK]);
      expect(after).toMatchObject({
        id: user.id,
        version: user.version + 1,
        role: 'reviewer',
        tier: 'vedeni',
        status: 'active',
      });
      const sha = createHash('sha256').update('theirs').digest('hex');
      expect(await world.tx(cli, (tx) => tx.sessions.find(sha), 'read')).not.toBeNull();
    });

    it('writes only from the version the change started from, and then writes nothing', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      await set(world.as(head), user, [IT]);
      await expect(set(world.as(head), user, [MAJETEK])).rejects.toBeInstanceOf(StaleVersion);
      expect((await read(cli, [user.id])).get(user.id)).toEqual([IT]);
    });

    it('holds any tier, a student too', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const student = await world.seed.user({ role: 'submitter', tier: 'student' });
      await set(world.as(head), student, [{ head: 'clen', complement: 'PR oddělení' }]);
      expect((await read(cli, [student.id])).get(student.id)).toHaveLength(1);
    });

    it('lets a headmaster set their own functions: a function grants no rights', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      await set(world.as(head), head, [MAJETEK]);
      expect((await read(cli, [head.id])).get(head.id)).toEqual([MAJETEK]);
    });

    it('refuses anyone but a headmaster, even on themselves', async () => {
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const user = await world.seed.user({ role: 'submitter' });
      await expect(set(world.as(reviewer), user, [IT])).rejects.toBeInstanceOf(ScopeViolation);
      await expect(set(world.as(user), user, [IT])).rejects.toBeInstanceOf(ScopeViolation);
      expect((await read(cli, [user.id])).size).toBe(0);
    });

    it('reads several users at once, within the principal’s scope', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const me = await world.seed.user({ role: 'submitter' });
      const other = await world.seed.user({ role: 'submitter' });
      await set(world.as(head), me, [IT]);
      await set(world.as(head), other, [CLEN]);
      const all = await read(world.as(head), [me.id, other.id]);
      expect([...all.keys()].sort()).toEqual([me.id, other.id].sort());
      expect([...(await read(world.as(me), [me.id, other.id])).keys()]).toEqual([me.id]);
    });

    it('goes with the user when they are deleted', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      await set(world.as(head), user, [IT]);
      await world.erase.user(user.id);
      expect((await read(cli, [user.id])).size).toBe(0);
    });
  });
});
