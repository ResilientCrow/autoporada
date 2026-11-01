import { describe, expect, it } from 'vitest';

import { LockTimeout, system } from '@/application/ports';
import { SIGN_IN_TTL_MS } from '@/domain/identity';
import { digest, newToken } from '@/server/auth';

import {
  APP_ORIGIN,
  expectSignInFailed,
  setupSignInHarness,
  SIGN_IN_CLEARED as CLEARED,
} from '../support/oidc/harness';
import { DELETE, MEMBER } from '../support/oidc/test-idp';
import { signedIn } from '../support/sessions';

const harness = setupSignInHarness({
  bootstrapHeadmasterOid: '99999999-0000-4000-8000-000000000099',
});
const SESSION = /^__Host-ap_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax$/;

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
    expect(again.headers.getSetCookie()).toEqual([CLEARED]);
    // The same answer in another browser that copied the cookie.
    const thief = harness.h.browser();
    thief.cookies.set('__Host-ap_signin', signInCookie.cookie);
    const stolen = await thief.send(harness.h.routes.callback, `/auth/callback${search}`);
    expectSignInFailed(stolen, 'expired');
    expect(harness.h.idp.seen.tokenRequests).toHaveLength(1);
  });

  it('ends the session this browser had before, whoever owned it', async () => {
    const { world } = harness.h;
    const other = await world.seed.user({ oid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' });
    const previous = newToken();
    await signedIn(world, other.id, previous);
    const b = harness.h.browser();
    b.cookies.set('__Host-ap_session', previous);
    const { response } = await signIn(b, { start: '/auth/login?returnTo=%2F&account=select' });
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/`);
    expect(await sessionOf(previous)).toBeNull();
    expect((await sessionOf(b.cookies.get('__Host-ap_session')))?.user.oid).toBe(MEMBER.oid);
  });

  it('ends no session when the browser sent two session cookies', async () => {
    const { world } = harness.h;
    const [mine, other] = [newToken(), newToken()];
    const a = await world.seed.user({ oid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' });
    const c = await world.seed.user({ oid: 'cccccccc-dddd-4eee-8fff-000000000000' });
    await signedIn(world, a.id, mine);
    await signedIn(world, c.id, other);
    const b = harness.h.browser();
    b.cookies.set('__Host-ap_session', mine);
    const start = await b.send(harness.h.routes.login, '/auth/login?account=select');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    await b.send(harness.h.routes.callback, `/auth/callback${search}`, {
      extraCookie: `__Host-ap_session=${other}`,
    });
    expect([await sessionOf(mine), await sessionOf(other)]).toEqual([
      expect.anything(),
      expect.anything(),
    ]);
  });

  it.each([
    ['lost', undefined],
    ['refused as busy', new LockTimeout()],
  ])(
    'still turns a guest away when the audit of the refusal is %s, and logs it',
    async (_name, error) => {
      const b = harness.h.browser();
      const start = await b.send(harness.h.routes.login, '/auth/login');
      harness.h.idp.next({ claims: { acct: 1 } });
      const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
      harness.h.failTransaction(2, error);
      const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
      expectSignInFailed(response, 'not-member');
      expect(harness.h.lines.filter((l) => l.level === 'error').map((l) => l.message)).toEqual([
        'could not audit a refused sign-in',
      ]);
    },
  );

  it('refuses a callback after ten minutes', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    harness.h.advance(SIGN_IN_TTL_MS + 1);
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expectSignInFailed(response, 'expired');
    expect(b.cookies.has('__Host-ap_session')).toBe(false);
    // Checked before the code is redeemed at Entra.
    expect(harness.h.idp.seen.tokenRequests).toEqual([]);
  });

  it.each([
    ['taking the sign-in', 1, undefined, 'database-down'],
    ['completing it', 2, undefined, 'database-down'],
    ['taking the sign-in, busy', 1, new LockTimeout(), 'timeout'],
    ['completing it, busy', 2, new LockTimeout(), 'timeout'],
  ])(
    'names the cause and clears its cookie when the database fails while %s',
    async (_name, n, error, cause) => {
      const b = harness.h.browser();
      const start = await b.send(harness.h.routes.login, '/auth/login');
      const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
      harness.h.failTransaction(n, error);
      const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
      expectSignInFailed(response, cause);
      expect(b.cookies.has('__Host-ap_session')).toBe(false);
      expect(harness.h.lines).toContainEqual(
        expect.objectContaining({
          level: expect.stringMatching(/^(warn|error)$/),
          fields: expect.objectContaining({ reqId: 'req-test-0001', cause }),
        }),
      );
    },
  );

  it('names the cause when the session lookup throws before the callback runs', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    b.cookies.set('__Host-ap_session', newToken());
    harness.h.failTransaction(
      1,
      Object.assign(new Error('relation missing'), { code: '42P01', severity: 'ERROR' }),
    );
    const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expectSignInFailed(response, 'database-setup');
  });

  it.each([
    ['a second state', (search: string) => `${search}&state=${'A'.repeat(43)}`],
    ['a malformed state', (search: string) => search.replace(/state=[^&]+/, 'state=short')],
    ['an oversized query', (search: string) => `${search}&pad=${'x'.repeat(4096)}`],
  ])('finds nothing to finish with %s, before any transaction', async (_name, edit) => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const opened = harness.h.transactions();
    const response = await b.send(harness.h.routes.callback, `/auth/callback${edit(search)}`);
    expectSignInFailed(response, 'expired');
    expect(harness.h.transactions()).toBe(opened);
    expect(harness.h.idp.seen.tokenRequests).toEqual([]);
  });

  it('finds nothing to finish with a malformed sign-in cookie, before any transaction', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    b.cookies.set('__Host-ap_signin', 'not-a-token');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const opened = harness.h.transactions();
    expectSignInFailed(
      await b.send(harness.h.routes.callback, `/auth/callback${search}`),
      'expired',
    );
    expect(harness.h.transactions()).toBe(opened);
  });

  it('refuses a callback without the browser’s sign-in cookie', async () => {
    const b = harness.h.browser();
    const start = await b.send(harness.h.routes.login, '/auth/login');
    b.cookies.delete('__Host-ap_signin');
    const search = harness.h.idp.authorize(start.headers.get('location') ?? '');
    const response = await b.send(harness.h.routes.callback, `/auth/callback${search}`);
    expectSignInFailed(response, 'expired');
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
    expectSignInFailed(response, 'not-member');
    expect(b.cookies.has('__Host-ap_session')).toBe(false);
    expect(await harness.h.world.tx(system('cli:test'), (tx) => tx.users.list(), 'read')).toEqual(
      [],
    );
    expect(await audit()).toEqual([['auth.rejected', { ...meta, purpose: 'login' }]]);
  });

  it('fails closed when Entra omits an optional claim, and says the claims are missing', async () => {
    const { response } = await signIn(harness.h.browser(), { claims: { acct: DELETE } });
    expectSignInFailed(response, 'claims');
    expect(await audit()).toEqual([
      ['auth.rejected', { reason: 'missing-claim', claim: 'acct', signals: [], purpose: 'login' }],
    ]);
  });

  it('refuses a malformed claim as unusable claims, and audits it', async () => {
    const { response } = await signIn(harness.h.browser(), { claims: { oid: 'not-a-guid' } });
    expectSignInFailed(response, 'claims');
    expect(await audit()).toEqual([
      ['auth.rejected', { reason: 'invalid-claim', claim: 'oid', signals: [], purpose: 'login' }],
    ]);
  });

  it('turns away a blocked account', async () => {
    await harness.h.world.seed.user({ oid: MEMBER.oid, status: 'blocked' });
    const { response } = await signIn(harness.h.browser());
    expectSignInFailed(response, 'blocked');
  });

  it('says so when the user cancelled at Entra, and audits nothing', async () => {
    const { response } = await signIn(harness.h.browser(), { tamper: { error: 'access_denied' } });
    expectSignInFailed(response, 'cancelled');
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
      return { b, token, user };
    }
    const rejection = async () =>
      (await harness.h.world.inspect.audit()).find((a) => a.action === 'auth.rejected');

    it('replaces the session with a fresh one after the password', async () => {
      const { b, token } = await signedInHeadmaster();
      const { response } = await signIn(b, { start: '/auth/step-up?returnTo=%2Fuzivatele' });
      expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/uzivatele`);
      expect(await sessionOf(token)).toBeNull();
      expect(b.cookies.get('__Host-ap_session')).not.toBe(token);
    });

    it('refuses another account and keeps the current session', async () => {
      const { b, token, user } = await signedInHeadmaster();
      const { response } = await signIn(b, {
        start: '/auth/step-up?returnTo=%2F',
        persona: { oid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' },
      });
      expectSignInFailed(response, 'step-up-mismatch');
      expect(await sessionOf(token)).not.toBeNull();
      expect(await rejection()).toMatchObject({
        targetType: 'user',
        targetId: user.id,
        data: { meta: { reason: 'other-account', purpose: 'step_up' } },
      });
    });

    it('refuses a sign-in that did not ask for the password again', async () => {
      const { b, user } = await signedInHeadmaster();
      const before = Math.floor(harness.h.world.clock.now().getTime() / 1000) - 3600;
      const { response } = await signIn(b, {
        start: '/auth/step-up?returnTo=%2F',
        claims: { auth_time: before },
      });
      expectSignInFailed(response, 'step-up-stale');
      expect(await rejection()).toMatchObject({
        targetType: 'user',
        targetId: user.id,
        data: { meta: { reason: 'stale-auth', claim: 'auth_time', purpose: 'step_up' } },
      });
    });
  });
});
