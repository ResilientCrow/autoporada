import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { sha } from '../../../../test/support/sign-in';
import { setupWorld, TEST_TID } from '../../../../test/support/world';
import { completeSignIn } from './index';

const world = setupWorld();
const callback = system('auth.callback');
const OID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_OID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const input = (over: Record<string, unknown> = {}) => ({
  purpose: 'login',
  identity: { tid: TEST_TID, oid: OID, displayName: 'Jana Nováková', email: 'jana@ssps.cz' },
  authTime: Math.floor(world.clock.now().getTime() / 1000) - 5,
  sessionTokenSha256: sha('new-session'),
  replacesSessionSha256: null,
  expectedUserId: null,
  bootstrapHeadmasterOid: null,
  ...over,
});
const complete = (over: Record<string, unknown> = {}) =>
  world.run(completeSignIn, callback, input(over));
const sessionOf = async (token: string) =>
  world.tx(system('auth.session'), (tx) => tx.sessions.find(sha(token)), 'read');
const actions = async () => (await world.inspect.audit()).map((a) => [a.action, a.data['meta']]);

describe('auth.completeSignIn', () => {
  it('signs a new member in as pending, with a session and an audit event', async () => {
    const result = await complete();
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'signed-in', bootstrapped: false },
    });
    const found = await sessionOf('new-session');
    expect(found?.user).toMatchObject({ oid: OID, role: 'pending', displayName: 'Jana Nováková' });
    expect(found?.session.authTime).toEqual(
      new Date((Math.floor(world.clock.now().getTime() / 1000) - 5) * 1000),
    );
    expect(await actions()).toEqual([
      ['auth.login', { purpose: 'login', bootstrapped: false, firstSignIn: true }],
    ]);
  });

  it('keeps the role of a known user, refreshes the name and ends the browser’s old session', async () => {
    const known = await world.seed.user({ oid: OID, role: 'reviewer', displayName: 'Jana Stará' });
    await complete({ sessionTokenSha256: sha('old-session') });
    world.clock.advance(60_000);
    const result = await complete({ replacesSessionSha256: sha('old-session') });
    expect(result).toEqual({
      ok: true,
      value: { outcome: 'signed-in', userId: known.id, bootstrapped: false },
    });
    expect(await sessionOf('old-session')).toBeNull();
    expect((await sessionOf('new-session'))?.user).toMatchObject({
      role: 'reviewer',
      displayName: 'Jana Nováková',
    });
    const login = (await world.inspect.audit()).at(-1);
    expect(login?.data['related']).toHaveLength(2);
    expect(login?.data['meta']).toMatchObject({ firstSignIn: false });
  });

  it('ends whatever session the browser had, even someone else’s', async () => {
    await complete({
      identity: { tid: TEST_TID, oid: OTHER_OID, displayName: 'Petr', email: null },
      sessionTokenSha256: sha('shared-pc'),
    });
    await complete({ replacesSessionSha256: sha('shared-pc') });
    expect(await sessionOf('shared-pc')).toBeNull();
  });

  it('refuses blocked and deactivated accounts, and says so in the audit log', async () => {
    await world.seed.user({ oid: OID, role: 'submitter', status: 'blocked' });
    expect(await complete()).toEqual({
      ok: true,
      value: { outcome: 'refused', reason: 'inactive' },
    });
    expect(await sessionOf('new-session')).toBeNull();
    expect(await actions()).toEqual([['auth.rejected', { reason: 'inactive', purpose: 'login' }]]);
  });

  it('makes the configured account the first headmaster, once', async () => {
    const first = await complete({ bootstrapHeadmasterOid: OID });
    expect(first).toMatchObject({ ok: true, value: { bootstrapped: true } });
    expect((await sessionOf('new-session'))?.user.role).toBe('headmaster');
    const audit = await world.inspect.audit();
    expect(audit.map((a) => a.action)).toEqual(['user.bootstrapHeadmaster', 'auth.login']);
    expect(audit[0]?.data['diff']).toEqual({ role: { from: 'pending', to: 'headmaster' } });
    const other = await complete({
      identity: { tid: TEST_TID, oid: OTHER_OID, displayName: 'Petr', email: null },
      sessionTokenSha256: sha('second'),
      bootstrapHeadmasterOid: OTHER_OID,
    });
    expect(other).toMatchObject({ ok: true, value: { bootstrapped: false } });
    expect((await sessionOf('second'))?.user.role).toBe('pending');
  });

  describe('step-up', () => {
    const stepUp = (user: UserRecord, over: Record<string, unknown> = {}) =>
      complete({
        purpose: 'step_up',
        expectedUserId: user.id,
        replacesSessionSha256: sha('current'),
        ...over,
      });

    it('replaces the session with a fresh one for the same account', async () => {
      const user = await world.seed.user({ oid: OID, role: 'headmaster' });
      await complete({ sessionTokenSha256: sha('current') });
      world.clock.advance(60_000);
      expect(await stepUp(user)).toMatchObject({
        ok: true,
        value: { outcome: 'signed-in', userId: user.id },
      });
      expect(await sessionOf('current')).toBeNull();
      expect((await sessionOf('new-session'))?.session.createdAt).toEqual(world.clock.now());
    });

    it('refuses another account and leaves the current session alone', async () => {
      const user = await world.seed.user({ oid: OID, role: 'headmaster' });
      await complete({ sessionTokenSha256: sha('current') });
      const result = await stepUp(user, {
        identity: { tid: TEST_TID, oid: OTHER_OID, displayName: 'Petr', email: null },
      });
      expect(result).toEqual({ ok: true, value: { outcome: 'refused', reason: 'other-account' } });
      expect(await sessionOf('current')).not.toBeNull();
      const users = await world.tx(callback, (tx) => tx.users.list(), 'read');
      expect(users.map((u) => u.oid)).toEqual([OID]);
    });
  });

  it('runs for the sign-in callback only', async () => {
    await expect(world.run(completeSignIn, system('job:mail.send'), input())).rejects.toThrow(
      /not for job:mail.send/,
    );
  });
});
