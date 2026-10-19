import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SIGN_IN_TTL_MS } from '@/domain/identity';
import { digest, newToken } from '@/server/session';

import { APP_ORIGIN, setupSignInHarness } from '../support/oidc/harness';
import { DELETE, MEMBER } from '../support/oidc/test-idp';
import { signedIn } from '../support/sessions';

const harness = setupSignInHarness({
  bootstrapHeadmasterOid: '99999999-0000-4000-8000-000000000099',
});
const SESSION = /^__Host-ap_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax$/;
const CLEARED = '__Host-ap_signin=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
const failed = (error: string, withCode = false) =>
  `${APP_ORIGIN}/prihlaseni?chyba=${error}${withCode ? '&kod=req-test-0001' : ''}`;

type Browser = ReturnType<typeof harness.h.browser>;

/** Login, the browser at Entra, then the callback; returns the callback's answer and its query. */
async function signIn(
  b: Browser,
  options: {
    readonly persona?: Partial<typeof MEMBER>;
    readonly claims?: Record<string, unknown>;
    readonly tamper?: { state?: string; error?: string; description?: string };
    readonly start?: string;
  } = {},
) {
  const { idp, routes } = harness.h;
  const path = options.start ?? '/auth/login?returnTo=%2Fporada';
  const start = await b.send(path.startsWith('/auth/step-up') ? routes.stepUp : routes.login, path);
  if (options.claims) idp.next({ claims: options.claims });
  const search = idp.authorize(
    start.headers.get('location') ?? '',
    options.persona,
    options.tamper,
  );
  return { response: await b.send(routes.callback, `/auth/callback${search}`), search };
}
const sessionOf = (token: string | undefined) =>
  harness.h.world.tx(system('auth.session'), (tx) => tx.sessions.find(digest(token ?? '')), 'read');
const audit = async () =>
  (await harness.h.world.inspect.audit()).map((a) => [a.action, a.data['meta']]);

describe('GET /auth/callback', () => {
  it('signs a member in and sends them back where they started', async () => {
    const b = harness.h.browser();
    const { response } = await signIn(b);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/porada`);
    expect(response.headers.getSetCookie()).toEqual([expect.stringMatching(SESSION), CLEARED]);
    const found = await sessionOf(b.cookies.get('__Host-ap_session'));
    expect(found?.user).toMatchObject({
      oid: MEMBER.oid,
      role: 'pending',
      displayName: MEMBER.name,
    });
    expect(await audit()).toEqual([
      ['auth.login', { purpose: 'login', bootstrapped: false, firstSignIn: true }],
    ]);
  });

  it('can be used once: a replay finds nothing to finish', async () => {
    const b = harness.h.browser();
    const signInCookie = await (async () => {
      const start = await b.send(harness.h.routes.login, '/auth/login');
      return {
        cookie: b.cookies.get('__Host-ap_signin') ?? '',
        location: start.headers.get('location') ?? '',
      };
    })();
    const search = harness.h.idp.authorize(signInCookie.location);
    await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    // Back button in the same, now signed-in browser.
    b.cookies.set('__Host-ap_signin', signInCookie.cookie);
    const again = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expect(again.headers.get('location')).toBe(`${APP_ORIGIN}/`);
    // The same answer in another browser that copied the cookie.
    const thief = harness.h.browser();
    thief.cookies.set('__Host-ap_signin', signInCookie.cookie);
    const stolen = await thief.send(harness.h.routes.callback, `/auth/callback${search}`);
    expect(stolen.headers.get('location')).toBe(failed('expired'));
    expect(harness.h.idp.seen.tokenRequests).toHaveLength(1);
  });

  it('refuses a callback after ten minutes', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    harness.h.advance(SIGN_IN_TTL_MS + 1);
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expect(response.headers.get('location')).toBe(failed('expired'));
    expect(b.cookies.has('__Host-ap_session')).toBe(false);
  });

  it('refuses a callback without the browser’s sign-in cookie', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    b.cookies.delete('__Host-ap_signin');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expect(response.headers.get('location')).toBe(failed('expired'));
    expect(harness.h.idp.seen.tokenRequests).toEqual([]);
  });

  it.each([
    ['a guest (acct = 1)', { acct: 1 }, { reason: 'guest', claim: 'acct', signals: ['acct'] }],
    [
      'an #EXT# account',
      { upn: 'x_gmail.com#EXT#@ssps.cz' },
      { reason: 'guest', claim: 'upn', signals: ['upn'] },
    ],
    [
      'another tenant',
      { tid: '99999999-0000-4000-8000-000000000000' },
      { reason: 'tenant', claim: 'tid', signals: [] },
    ],
  ])('turns away %s, creates no account and audits why', async (_name, claims, meta) => {
    const b = harness.h.browser();
    const { response } = await signIn(b, { claims });
    expect(response.headers.get('location')).toBe(failed('not-member'));
    expect(b.cookies.has('__Host-ap_session')).toBe(false);
    expect(await harness.h.world.tx(system('cli:test'), (tx) => tx.users.list(), 'read')).toEqual(
      [],
    );
    expect(await audit()).toEqual([['auth.rejected', { ...meta, purpose: 'login' }]]);
  });

  it('fails closed when Entra omits an optional claim, with a code to report', async () => {
    const { response } = await signIn(harness.h.browser(), { claims: { acct: DELETE } });
    expect(response.headers.get('location')).toBe(failed('failed', true));
    expect(await audit()).toEqual([
      ['auth.rejected', { reason: 'missing-claim', claim: 'acct', signals: [], purpose: 'login' }],
    ]);
  });

  it('turns away a blocked account', async () => {
    await harness.h.world.seed.user({ oid: MEMBER.oid, status: 'blocked' });
    const { response } = await signIn(harness.h.browser());
    expect(response.headers.get('location')).toBe(failed('blocked'));
  });

  it('says so when the user cancelled at Entra, and audits nothing', async () => {
    const { response } = await signIn(harness.h.browser(), { tamper: { error: 'access_denied' } });
    expect(response.headers.get('location')).toBe(failed('cancelled'));
    expect(await audit()).toEqual([]);
  });

  it('makes the configured account the first headmaster', async () => {
    const b = harness.h.browser();
    await signIn(b, { persona: { oid: '99999999-0000-4000-8000-000000000099' } });
    expect((await sessionOf(b.cookies.get('__Host-ap_session')))?.user.role).toBe('headmaster');
  });

  describe('step-up', () => {
    async function signedInHeadmaster() {
      const { world } = harness.h;
      const user = await world.seed.user({ oid: MEMBER.oid, role: 'headmaster' });
      const token = newToken();
      await signedIn(world, user.id, token);
      const b = harness.h.browser();
      b.cookies.set('__Host-ap_session', token);
      return { b, token };
    }

    it('replaces the session with a fresh one after the password', async () => {
      const { b, token } = await signedInHeadmaster();
      const { response } = await signIn(b, { start: '/auth/step-up?returnTo=%2Fuzivatele' });
      expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/uzivatele`);
      expect(await sessionOf(token)).toBeNull();
      expect(b.cookies.get('__Host-ap_session')).not.toBe(token);
    });

    it('refuses another account and keeps the current session', async () => {
      const { b, token } = await signedInHeadmaster();
      const { response } = await signIn(b, {
        start: '/auth/step-up?returnTo=%2F',
        persona: { oid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' },
      });
      expect(response.headers.get('location')).toBe(failed('step-up-mismatch'));
      expect(await sessionOf(token)).not.toBeNull();
    });

    it('refuses a sign-in that did not ask for the password again', async () => {
      const { b } = await signedInHeadmaster();
      const before = Math.floor(harness.h.world.clock.now().getTime() / 1000) - 3600;
      const { response } = await signIn(b, {
        start: '/auth/step-up?returnTo=%2F',
        claims: { auth_time: before },
      });
      expect(response.headers.get('location')).toBe(failed('step-up-stale'));
    });
  });
});
