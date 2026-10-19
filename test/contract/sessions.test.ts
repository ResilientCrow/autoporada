import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ScopeViolation, system, type Tx, type UserRecord } from '@/application/ports';
import { newSessionTimes } from '@/domain/identity';

import { setupWorld } from '../support/world';

const world = setupWorld();
const auth = system('auth.callback');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Creates a session and names it in the audit log, as a sign-in would. */
const signIn = (user: UserRecord, token: string) =>
  world.tx(auth, async (tx) => {
    const session = await tx.sessions.create({
      tokenSha256: sha(token),
      userId: user.id,
      authTime: world.clock.now(),
      ...newSessionTimes(world.clock.now()),
    });
    await tx.audit.record({
      action: 'auth.login',
      target: { type: 'user', id: user.id },
      related: [{ type: 'session', id: session.id }],
    });
    return session;
  });

/** Ends sessions and names them, as sign-out would. */
const endAs = (
  principal: Parameters<typeof world.tx>[0],
  selector: Parameters<Tx['sessions']['end']>[0],
) =>
  world.tx(principal, async (tx) => {
    const ended = await tx.sessions.end(selector);
    await tx.audit.record({
      action: 'auth.logout',
      target: null,
      related: ended.map((id) => ({ type: 'session', id })),
    });
    return ended;
  });

describe('SessionRepo (port contract)', () => {
  it('finds a session by its token digest, with its user as stored now', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const session = await signIn(user, 'token-a');
    const found = await world.tx(
      system('auth.session'),
      (tx) => tx.sessions.find(sha('token-a')),
      'read',
    );
    expect(found).toEqual({ session, user });
    expect(session).toMatchObject({ userId: user.id, createdAt: world.clock.now() });
    expect(
      await world.tx(system('auth.session'), (tx) => tx.sessions.find(sha('other')), 'read'),
    ).toBeNull();
  });

  it('pushes the idle limit on a touch', async () => {
    const user = await world.seed.user();
    const session = await signIn(user, 'token-a');
    const later = new Date(world.clock.now().getTime() + 600_000);
    await world.tx(system('auth.session'), async (tx) => {
      await tx.sessions.touch(session.id, { lastSeenAt: later, idleExpiresAt: later });
      tx.audit.exempt('session-touch', { type: 'session', id: session.id });
    });
    const found = await world.tx(
      system('auth.session'),
      (tx) => tx.sessions.find(sha('token-a')),
      'read',
    );
    expect(found?.session).toMatchObject({
      lastSeenAt: later,
      idleExpiresAt: later,
      absExpiresAt: session.absExpiresAt,
    });
  });

  it('lets the system end sessions by id, digest or user', async () => {
    const user = await world.seed.user();
    const [a, b, c] = [await signIn(user, 'a'), await signIn(user, 'b'), await signIn(user, 'c')];
    expect(await endAs(auth, { id: a.id })).toEqual([a.id]);
    expect(await endAs(auth, { tokenSha256: sha('b') })).toEqual([b.id]);
    expect(await endAs(auth, { userId: user.id })).toEqual([c.id]);
  });

  it('lets a user end only their own sessions', async () => {
    const me = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    const [mine, theirs] = [await signIn(me, 'mine'), await signIn(other, 'theirs')];
    const as = world.as(me);
    expect(await endAs(as, { id: theirs.id })).toEqual([]);
    await expect(endAs(as, { userId: other.id })).rejects.toBeInstanceOf(ScopeViolation);
    await expect(endAs(as, { tokenSha256: sha('theirs') })).rejects.toBeInstanceOf(ScopeViolation);
    expect(await endAs(as, { userId: me.id })).toEqual([mine.id]);
    const left = await world.tx(auth, (tx) => tx.sessions.find(sha('theirs')), 'read');
    expect(left?.session.id).toBe(theirs.id);
  });

  it('keeps finding, creating and touching to the system', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    const session = await signIn(user, 'token-a');
    const as = world.as(user);
    await expect(
      world.tx(as, (tx) => tx.sessions.find(sha('token-a')), 'read'),
    ).rejects.toBeInstanceOf(ScopeViolation);
    await expect(
      world.tx(as, (tx) =>
        tx.sessions.touch(session.id, {
          lastSeenAt: world.clock.now(),
          idleExpiresAt: world.clock.now(),
        }),
      ),
    ).rejects.toBeInstanceOf(ScopeViolation);
  });
});
