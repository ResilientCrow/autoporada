import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { digest, newToken } from '@/server/auth';

import { APP_ORIGIN, setupSignInHarness } from '../support/oidc/harness';
import { signedIn } from '../support/sessions';

const harness = setupSignInHarness();
const SIGN_IN_COOKIE =
  /^__Host-ap_signin=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/;

/** The pending sign-in a browser's cookie and Entra's state point at. */
async function pendingFor(cookie: string, location: string) {
  const state = new URL(location).searchParams.get('state') ?? '';
  const { world } = harness.h;
  return world.tx(system('auth.callback'), (tx) => tx.signIns.take(digest(cookie), state));
}

describe('GET /auth/login', () => {
  it('sends an anonymous browser to Entra with a sign-in cookie', async () => {
    const { routes, browser } = harness.h;
    const b = browser();
    const response = await b.send(routes.login, '/auth/login?returnTo=%2Fporada%3Ftab%3D1');
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location).toMatch(
      /^https:\/\/login\.microsoftonline\.com\/.+\/oauth2\/v2\.0\/authorize\?/,
    );
    expect(response.headers.getSetCookie()).toEqual([expect.stringMatching(SIGN_IN_COOKIE)]);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const pending = await pendingFor(b.cookies.get('__Host-ap_signin') ?? '', location);
    expect(pending).toMatchObject({ purpose: 'login', userId: null, returnTo: '/porada?tab=1' });
    const params = new URL(location).searchParams;
    expect(params.get('nonce')).toBe(pending?.nonce);
    expect(params.get('prompt')).toBeNull();
  });

  it('never stores a return path off this origin', async () => {
    const { routes, browser } = harness.h;
    const b = browser();
    const response = await b.send(routes.login, '/auth/login?returnTo=%2F%2Fevil.example');
    const pending = await pendingFor(
      b.cookies.get('__Host-ap_signin') ?? '',
      response.headers.get('location') ?? '',
    );
    expect(pending?.returnTo).toBe('/');
  });

  it('sends a signed-in browser straight back, unless it asked to switch accounts', async () => {
    const { world, routes, browser } = harness.h;
    const user = await world.seed.user({ role: 'submitter' });
    const token = newToken();
    await signedIn(world, user.id, token);
    const b = browser();
    b.cookies.set('__Host-ap_session', token);
    const back = await b.send(routes.login, '/auth/login?returnTo=%2Fporada');
    expect(back.headers.get('location')).toBe(`${APP_ORIGIN}/porada`);
    const select = await b.send(routes.login, '/auth/login?returnTo=%2Fporada&account=select');
    expect(new URL(select.headers.get('location') ?? '').searchParams.get('prompt')).toBe(
      'select_account',
    );
  });

  it('says Entra is unavailable, with a code to report, and stores nothing', async () => {
    const { idp, routes, browser } = harness.h;
    idp.down();
    const b = browser();
    const response = await b.send(routes.login, '/auth/login');
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/prihlaseni?chyba=unavailable&kod=req-test-0001`,
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(harness.h.world.fake?.state().signIns.size ?? 0).toBe(0);
  });
});

describe('when the database fails', () => {
  const failed = `${APP_ORIGIN}/prihlaseni?chyba=failed&kod=req-test-0001`;

  it('login still redirects with a code, and sets no sign-in cookie', async () => {
    const b = harness.h.browser();
    harness.h.failTransaction(1);
    const response = await b.send(harness.h.routes.login, '/auth/login');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(failed);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ['looking up the session', 1],
    ['storing the sign-in', 2],
  ])('step-up still redirects with a code when it fails %s', async (_name, n) => {
    const { world, routes, browser } = harness.h;
    const user = await world.seed.user({ role: 'headmaster' });
    const token = newToken();
    await signedIn(world, user.id, token);
    const b = browser();
    b.cookies.set('__Host-ap_session', token);
    harness.h.failTransaction(n);
    const response = await b.send(routes.stepUp, '/auth/step-up?returnTo=%2F');
    expect(response.headers.get('location')).toBe(failed);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe('GET /auth/step-up', () => {
  it('asks a signed-in user for the password again, bound to their account', async () => {
    const { world, routes, browser } = harness.h;
    const user = await world.seed.user({ role: 'headmaster' });
    const token = newToken();
    await signedIn(world, user.id, token);
    const b = browser();
    b.cookies.set('__Host-ap_session', token);
    const response = await b.send(routes.stepUp, '/auth/step-up?returnTo=%2Fuzivatele');
    const location = response.headers.get('location') ?? '';
    expect(new URL(location).searchParams.get('prompt')).toBe('login');
    const pending = await pendingFor(b.cookies.get('__Host-ap_signin') ?? '', location);
    expect(pending).toMatchObject({ purpose: 'step_up', userId: user.id, returnTo: '/uzivatele' });
  });

  it('sends an anonymous browser to the sign-in page', async () => {
    const { routes, browser } = harness.h;
    const response = await browser().send(routes.stepUp, '/auth/step-up?returnTo=%2Fuzivatele');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toMatch(
      /^https:\/\/autoporada\.ssps\.cz\/prihlaseni\?returnTo=/,
    );
  });
});
