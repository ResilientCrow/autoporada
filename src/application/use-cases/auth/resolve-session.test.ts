import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_MS } from '@/domain/identity';

import { signedIn } from '../../../../test/support/sessions';
import { sha } from '../../../../test/support/sign-in';
import { setupWorld } from '../../../../test/support/world';
import { resolveSession } from './index';

const world = setupWorld();
const resolve = (token = 'token') =>
  world.run(resolveSession, system('auth.session'), { tokenSha256: sha(token) });

describe('auth.resolveSession', () => {
  it('finds the signed-in user as stored now', async () => {
    const user = await world.seed.user({ role: 'reviewer', isStudent: false });
    const session = await signedIn(world, user.id, 'token');
    expect(await resolve()).toEqual({
      ok: true,
      value: {
        found: true,
        sessionId: session.id,
        authTime: world.clock.now().toISOString(),
        actor: { id: user.id, role: 'reviewer', status: 'active', isStudent: false },
      },
    });
    expect(await resolve('unknown')).toEqual({ ok: true, value: { found: false } });
  });

  it('touches the session at most every five minutes, without an audit event', async () => {
    const user = await world.seed.user();
    await signedIn(world, user.id, 'token');
    const signedInAt = world.clock.now();
    const before = (await world.inspect.audit()).length;
    const lastSeen = async () =>
      (await world.tx(system('auth.session'), (tx) => tx.sessions.find(sha('token')), 'read'))
        ?.session.lastSeenAt;
    world.clock.advance(SESSION_TOUCH_MS - 1);
    await resolve();
    expect(await lastSeen()).toEqual(signedInAt);
    world.clock.advance(1);
    await resolve();
    expect(await lastSeen()).toEqual(world.clock.now());
    expect((await world.inspect.audit()).length).toBe(before);
  });

  it('ends at the idle limit, and at the absolute limit however active the user was', async () => {
    const user = await world.seed.user();
    await signedIn(world, user.id, 'idle');
    world.clock.advance(SESSION_IDLE_MS - 1);
    expect((await resolve('idle')).ok && (await resolve('idle'))).toMatchObject({
      value: { found: true },
    });
    world.clock.advance(SESSION_IDLE_MS);
    expect(await resolve('idle')).toEqual({ ok: true, value: { found: false } });

    await signedIn(world, user.id, 'busy');
    for (let ms = 0; ms < SESSION_ABSOLUTE_MS - SESSION_TOUCH_MS; ms += SESSION_TOUCH_MS) {
      world.clock.advance(SESSION_TOUCH_MS);
      await resolve('busy');
    }
    world.clock.advance(SESSION_TOUCH_MS);
    expect(await resolve('busy')).toEqual({ ok: true, value: { found: false } });
  });

  it('finds nothing for a blocked user', async () => {
    const user = await world.seed.user({ status: 'blocked' });
    await signedIn(world, user.id, 'token');
    expect(await resolve()).toEqual({ ok: true, value: { found: false } });
  });
});
