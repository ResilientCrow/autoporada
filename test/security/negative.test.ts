/**
 * The OIDC negative suite (plan §11): what an attacker or a broken Entra
 * can send, through the real routes, in both worlds. The harness checks
 * after every case that no Entra call ran inside a transaction and that the
 * log holds no secret.
 */
import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { APP_ORIGIN, expectSignInFailed, setupSignInHarness } from '../support/oidc/harness';
import type { TestIdp } from '../support/oidc/test-idp';

const harness = setupSignInHarness();
const failed = (error: string, withCode = false) =>
  `${APP_ORIGIN}/prihlaseni?chyba=${error}${withCode ? '&kod=req-test-0001' : ''}`;

type Browser = ReturnType<typeof harness.h.browser>;

async function signIn(
  b: Browser,
  prepare: (idp: TestIdp) => void = () => {},
  tamper?: { state?: string; error?: string; description?: string },
  callbackBase = '',
) {
  const { idp, routes } = harness.h;
  const start = await b.send(routes.login, '/auth/login?returnTo=%2Fporada');
  const location = start.headers.get('location') ?? '';
  prepare(idp);
  const search = idp.authorize(location, {}, tamper);
  return b.send(routes.callback, `${callbackBase}/auth/callback${search}`);
}

const nothingKept = async () => {
  const { world } = harness.h;
  expect(await world.tx(system('cli:test'), (tx) => tx.users.list(), 'read')).toEqual([]);
  expect(await world.inspect.audit()).toEqual([]);
};

describe('forged ID tokens', () => {
  it.each(['other-key-same-kid', 'none', 'hs256-public-key', 'unknown-kid'] as const)(
    'refuses a token signed with %s and keeps nothing',
    async (sign) => {
      const response = await signIn(harness.h.browser(), (idp) => idp.next({ sign }));
      expectSignInFailed(response, 'failed', true);
      await nothingKept();
      expect(harness.h.idp.seen.jwksFetches).toBeLessThanOrEqual(2);
    },
  );
});

describe('claims the library checks', () => {
  const now = () => Math.floor(harness.h.world.clock.now().getTime() / 1000);

  it.each([
    ['another issuer', () => ({ iss: 'https://login.microsoftonline.com/common/v2.0' })],
    ['another audience', () => ({ aud: 'someone-else' })],
    [
      'a second audience without azp',
      () => ({ aud: ['11111111-2222-4333-8444-555555555555', 'other'] }),
    ],
    ['another nonce', () => ({ nonce: 'X'.repeat(43) })],
    ['a token expired 61 s ago', () => ({ exp: now() - 61 })],
    ['a token not valid for 2 minutes', () => ({ nbf: now() + 120 })],
  ])('refuses %s', async (_name, claims) => {
    const response = await signIn(harness.h.browser(), (idp) => idp.next({ claims: claims() }));
    expectSignInFailed(response, 'failed', true);
    await nothingKept();
  });

  it('accepts a token that expired 30 s ago (a minute of clock skew)', async () => {
    const response = await signIn(harness.h.browser(), (idp) =>
      idp.next({ claims: { exp: now() - 30 } }),
    );
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/porada`);
  });
});

describe('what Entra answers', () => {
  it.each([
    ['access_denied', undefined, 'cancelled', false],
    ['server_error', 'AADSTS90033: transient error for jana.novakova@ssps.cz', 'unavailable', true],
    ['invalid_request', 'AADSTS50011: redirect URI mismatch', 'failed', true],
  ])('maps %s at the authorization step', async (error, description, shown, withCode) => {
    const response = await signIn(harness.h.browser(), undefined, {
      error,
      ...(description && { description }),
    });
    expectSignInFailed(response, shown, withCode);
    await nothingKept();
  });

  it('logs only the error code and the AADSTS number, never the description', async () => {
    await signIn(harness.h.browser(), undefined, {
      error: 'server_error',
      description: 'AADSTS90033: transient error for jana.novakova@ssps.cz',
    });
    const warning = harness.h.lines.find((l) => l.level === 'warn');
    expect(warning?.fields).toMatchObject({ error: 'server_error', aadsts: 'AADSTS90033' });
    expect(JSON.stringify(warning)).not.toContain('transient');
  });

  it.each([
    ['a refused code', { status: 400, body: { error: 'invalid_grant' } }, 'failed'],
    [
      'a refused client',
      { status: 401, body: { error: 'invalid_client', error_description: 'AADSTS700027: x' } },
      'failed',
    ],
    ['an outage', { status: 503, body: { error: 'temporarily_unavailable' } }, 'unavailable'],
    [
      'a challenge header instead of a body',
      { status: 401, body: {}, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
      'failed',
    ],
    ['the network', 'network', 'unavailable'],
    ['a timeout', 'timeout', 'unavailable'],
  ] as const)('maps %s at the token endpoint', async (_name, answer, error) => {
    const response = await signIn(harness.h.browser(), (idp) => idp.failToken(answer));
    expectSignInFailed(response, error, true);
    // Mapped by the adapter, not caught as a bug by the pipeline.
    expect(harness.h.lines.filter((l) => l.level === 'error')).toEqual([]);
    await nothingKept();
  });
});

describe('the deployment', () => {
  it('sends Entra the public redirect URI even when the request came in on the internal host', async () => {
    const response = await signIn(harness.h.browser(), undefined, undefined, 'http://web:3000');
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/porada`);
    expect(harness.h.idp.seen.tokenRequests[0]?.get('redirect_uri')).toBe(
      `${APP_ORIGIN}/auth/callback`,
    );
  });

  it('gives a sign-in to exactly one of two concurrent callbacks', async () => {
    const { idp, routes } = harness.h;
    const b = harness.h.browser();
    const start = await b.send(routes.login, '/auth/login');
    const cookie = b.cookies.get('__Host-ap_signin') ?? '';
    const search = idp.authorize(start.headers.get('location') ?? '');
    const twin = harness.h.browser();
    twin.cookies.set('__Host-ap_signin', cookie);
    const answers = await Promise.all([
      b.send(routes.callback, `/auth/callback${search}`),
      twin.send(routes.callback, `/auth/callback${search}`),
    ]);
    const locations = answers.map((r) => r.headers.get('location')).sort();
    expect(locations).toEqual([`${APP_ORIGIN}/`, failed('expired')].sort());
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });
});
