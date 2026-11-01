import { describe, expect, it } from 'vitest';

import { LockTimeout, system } from '@/application/ports';
import { digest, newToken } from '@/server/auth';

import { APP_ORIGIN, setupSignInHarness } from '../support/oidc/harness';
import { signedIn } from '../support/sessions';

const harness = setupSignInHarness();
const CLEARED = '__Host-ap_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';

async function twoDevices() {
  const { world } = harness.h;
  const user = await world.seed.user({ role: 'submitter' });
  const [laptop, phone] = [newToken(), newToken()];
  await signedIn(world, user.id, laptop);
  await signedIn(world, user.id, phone);
  const b = harness.h.browser();
  b.cookies.set('__Host-ap_session', laptop);
  return { b, laptop, phone };
}
const live = (token: string) =>
  harness.h.world.tx(
    system('auth.session'),
    async (tx) => (await tx.sessions.find(digest(token))) !== null,
    'read',
  );

describe('POST /auth/logout', () => {
  it('ends this session and clears the cookie', async () => {
    const { b, laptop, phone } = await twoDevices();
    const response = await b.send(harness.h.routes.logout, '/auth/logout', {
      method: 'POST',
      body: 'scope=this',
    });
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/prihlaseni?odhlaseno=1`);
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
    expect([await live(laptop), await live(phone)]).toEqual([false, true]);
  });

  it('ends every session of the user with scope=all', async () => {
    const { b, phone } = await twoDevices();
    const response = await b.send(harness.h.routes.logout, '/auth/logout', {
      method: 'POST',
      body: 'scope=all',
    });
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/prihlaseni?odhlaseno=vsude`);
    expect(await live(phone)).toBe(false);
  });

  it.each([
    ['looking up the session', 1, undefined, 'database-down'],
    ['looking up the session, busy', 1, new LockTimeout(), 'bug'],
    ['ending it', 2, undefined, 'database-down'],
    ['ending it, busy', 2, new LockTimeout(), 'timeout'],
  ])(
    'still clears the cookie, and says why, when the database fails while %s',
    async (_name, n, error, cause) => {
      const { b, laptop } = await twoDevices();
      harness.h.failTransaction(n, error);
      const response = await b.send(harness.h.routes.logout, '/auth/logout', {
        method: 'POST',
        body: 'scope=all',
      });
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        `${APP_ORIGIN}/prihlaseni?chyba=signout-failed&pricina=${cause}`,
      );
      expect(response.headers.getSetCookie()).toEqual([CLEARED]);
      expect(await live(laptop)).toBe(true);
    },
  );

  it('clears a stale cookie even without a session', async () => {
    const b = harness.h.browser();
    b.cookies.set('__Host-ap_session', newToken());
    const response = await b.send(harness.h.routes.logout, '/auth/logout', {
      method: 'POST',
      body: '',
    });
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
  });

  it('refuses a logout posted from another site', async () => {
    const { b, laptop } = await twoDevices();
    const response = await b.send(harness.h.routes.logout, '/auth/logout', {
      method: 'POST',
      body: 'scope=all',
      origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
    expect(await live(laptop)).toBe(true);
  });
});
