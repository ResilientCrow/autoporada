import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cspNonce,
  galleryPage,
  getViewer,
  optionalSignedIn,
  requireSignedIn,
  signInPage,
} from './index';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string): never => {
    throw new Error(`redirect:${to}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));
const resolvePrincipal = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('../pipeline', async () => ({
  ...(await vi.importActual<object>('../pipeline')),
  runRegistered,
}));
const where = vi.hoisted(() => ({ environment: 'development' }));
vi.mock('../container', () => ({
  getContainer: () => ({
    resolvePrincipal,
    requestIdFrom: () => 'req-1',
    environment: where.environment,
  }),
}));

describe('galleryPage', () => {
  it.each(['development', 'test'])('exists in %s, and fails only on request', (environment) => {
    where.environment = environment;
    expect(galleryPage({})).toEqual({ fail: false });
    expect(galleryPage({ stav: 'x' })).toEqual({ fail: false });
    expect(galleryPage({ stav: 'vyjimka' })).toEqual({ fail: true });
  });

  it('does not exist in production', () => {
    where.environment = 'production';
    expect(galleryPage({ stav: 'vyjimka' })).toBeNull();
  });
});

describe('signInPage', () => {
  it('shows known errors with their code, and links that come back to a safe path', () => {
    expect(signInPage({ chyba: 'failed', kod: 'abcdef12-3456', returnTo: '/porada' })).toEqual({
      error: 'failed',
      code: 'abcdef12-3456',
      loggedOut: null,
      sharedComputerHint: false,
      loginHref: '/auth/login?returnTo=%2Fporada',
      switchHref: '/auth/login?returnTo=%2Fporada&account=select',
    });
  });

  it('ignores anything it does not know', () => {
    expect(
      signInPage({
        chyba: '<script>',
        kod: '<b>x</b>',
        returnTo: '//evil.example',
        odhlaseno: 'x',
      }),
    ).toEqual({
      error: null,
      code: null,
      loggedOut: null,
      sharedComputerHint: false,
      loginHref: '/auth/login?returnTo=%2F',
      switchHref: '/auth/login?returnTo=%2F&account=select',
    });
    expect(signInPage({ odhlaseno: 'vsude' }).loggedOut).toBe('everywhere');
  });
});

describe('signInPage after signing out', () => {
  it.each([{ odhlaseno: '1' }, { odhlaseno: 'vsude' }, { chyba: 'signout-failed' }])(
    'offers the account picker on the main button, and the shared-PC hint (%o)',
    (params) => {
      expect(signInPage(params)).toMatchObject({
        loginHref: '/auth/login?returnTo=%2F&account=select',
        sharedComputerHint: true,
      });
    },
  );
});

describe('getViewer', () => {
  beforeEach(() => resolvePrincipal.mockClear());

  it('looks up the one session cookie', async () => {
    request.headers = new Headers({ cookie: 'a=b; __Host-ap_session=tok' });
    await getViewer();
    expect(resolvePrincipal).toHaveBeenCalledWith('tok', 'req-1');
  });

  it('treats a cookie sent twice as none, though Next’s cookies() keeps the last', async () => {
    request.headers = new Headers({ cookie: '__Host-ap_session=one; __Host-ap_session=two' });
    await getViewer();
    expect(resolvePrincipal).toHaveBeenCalledWith(null, 'req-1');
  });
});

describe('cspNonce', () => {
  it('passes on the nonce the proxy set', async () => {
    request.headers = new Headers({ 'x-nonce': 'AAAAAAAAAAAAAAAAAAAAAA==' });
    expect(await cspNonce()).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
  });

  it.each([
    [undefined],
    ['bad"><script>'],
    ['AAAAAAAAAAAAAAAAAAAAA=='],
    ['AAAAAAAAAAAAAAAAAAAAAA'],
    ['AAAAAAAAAAAAAAAAAAAAAAA=='],
  ])('ignores %s', async (value) => {
    request.headers = new Headers(value === undefined ? {} : { 'x-nonce': value });
    expect(await cspNonce()).toBeNull();
  });
});

describe('signed-in pages', () => {
  const principal = (role: string) => ({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  });
  const signedIn = (role: string) => {
    resolvePrincipal.mockResolvedValue(principal(role));
    runRegistered.mockResolvedValue({ ok: true, value: { displayName: 'Jana', role } });
  };

  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue(null);
    runRegistered.mockReset();
    redirect.mockClear();
  });

  it('sends an anonymous visitor to sign in and back, to a safe path only', async () => {
    await expect(requireSignedIn('/porada')).rejects.toThrow(
      'redirect:/prihlaseni?returnTo=%2Fporada',
    );
    await expect(requireSignedIn('//evil.example')).rejects.toThrow(
      /^redirect:\/prihlaseni\?returnTo=%2F$/,
    );
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', true],
    ['submitter', false],
  ])('knows a %s user (pending %s)', async (role, pending) => {
    signedIn(role);
    const expected = { displayName: 'Jana', actor: principal(role).actor, pending };
    expect(await requireSignedIn('/')).toEqual(expected);
    expect(await optionalSignedIn()).toEqual(expected);
  });

  it('answers null to a visitor without asking the use case', async () => {
    expect(await optionalSignedIn()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('fails loudly when the profile cannot be read', async () => {
    resolvePrincipal.mockResolvedValue(principal('pending'));
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(optionalSignedIn()).rejects.toThrow('profile.me: unavailable');
  });
});
