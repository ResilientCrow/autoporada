/**
 * The OIDC negative suite (plan §11): what an attacker or a broken Entra
 * can send, through the real routes, in both worlds. After every case: no
 * Entra call ran inside a transaction, and the log holds no secret.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { APP_ORIGIN, setupSignInHarness } from '../support/oidc/harness';
import { MEMBER, type TestIdp } from '../support/oidc/test-idp';

const harness = setupSignInHarness();
const failed = (error: string, withCode = false) =>
  `${APP_ORIGIN}/prihlaseni?chyba=${error}${withCode ? '&kod=req-test-0001' : ''}`;
/** Everything that must never reach a log line. */
const secrets = new Set<string>();

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
  const params = new URL(location).searchParams;
  for (const key of ['state', 'nonce']) secrets.add(params.get(key) ?? '');
  secrets.add(b.cookies.get('__Host-ap_signin') ?? '');
  prepare(idp);
  const search = idp.authorize(location, {}, tamper);
  secrets.add(new URLSearchParams(search).get('code') ?? '');
  const response = await b.send(routes.callback, `${callbackBase}/auth/callback${search}`);
  secrets.add(b.cookies.get('__Host-ap_session') ?? '');
  return response;
}

const nothingKept = async () => {
  const { world } = harness.h;
  expect(await world.tx(system('cli:test'), (tx) => tx.users.list(), 'read')).toEqual([]);
  expect(await world.inspect.audit()).toEqual([]);
};

afterEach(() => {
  const { idp, lines } = harness.h;
  expect(idp.seen.calledInsideTransaction).toBe(0);
  const logged = JSON.stringify(lines);
  for (const secret of [...secrets, MEMBER.upn, MEMBER.email, MEMBER.name, 'eyJ']) {
    if (secret) expect(logged).not.toContain(secret);
  }
  secrets.clear();
});

describe('forged ID tokens', () => {
  it.each(['other-key-same-kid', 'none', 'hs256-public-key', 'unknown-kid'] as const)(
    'refuses a token signed with %s and keeps nothing',
    async (sign) => {
      const response = await signIn(harness.h.browser(), (idp) => idp.next({ sign }));
      expect(response.headers.get('location')).toBe(failed('failed', true));
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
    expect(response.headers.get('location')).toBe(failed('failed', true));
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
    ['access_denied', undefined, failed('cancelled')],
    [
      'server_error',
      'AADSTS90033: transient error for jana.novakova@ssps.cz',
      failed('unavailable', true),
    ],
    ['invalid_request', 'AADSTS50011: redirect URI mismatch', failed('failed', true)],
  ])('maps %s at the authorization step', async (error, description, location) => {
    const response = await signIn(harness.h.browser(), undefined, {
      error,
      ...(description && { description }),
    });
    expect(response.headers.get('location')).toBe(location);
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
    ['the network', 'network', 'unavailable'],
    ['a timeout', 'timeout', 'unavailable'],
  ] as const)('maps %s at the token endpoint', async (_name, answer, error) => {
    const response = await signIn(harness.h.browser(), (idp) => idp.failToken(answer));
    expect(response.headers.get('location')).toBe(failed(error, true));
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
    secrets.add(cookie);
    const answers = await Promise.all([
      b.send(routes.callback, `/auth/callback${search}`),
      twin.send(routes.callback, `/auth/callback${search}`),
    ]);
    const locations = answers.map((r) => r.headers.get('location')).sort();
    expect(locations).toEqual([`${APP_ORIGIN}/`, failed('expired')].sort());
    expect(idp.seen.tokenRequests).toHaveLength(1);
  });
});
