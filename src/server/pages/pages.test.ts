import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseFailure } from '@/application/ports';

import {
  cspNonce,
  galleryPage,
  getViewer,
  optionalSignedIn,
  requireSignedIn,
  signInPage,
} from './index';

const request = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
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
const logged = vi.hoisted(() => ({ error: vi.fn() }));
const where = vi.hoisted(() => ({
  environment: 'development',
  now: new Date('2026-10-24T12:00:00Z'),
  devServices: {
    issuer: 'http://localhost:8080/ssps',
    database: '127.0.0.1:5432' as string | undefined,
  } as { issuer: string; database: string | undefined } | undefined,
}));
vi.mock('../container', () => ({
  getContainer: () => ({
    resolvePrincipal,
    requestIdFrom: () => 'req-1',
    log: logged,
    environment: where.environment,
    ...(where.devServices && { devServices: where.devServices }),
    app: { clock: { now: () => where.now } },
  }),
}));

describe('galleryPage', () => {
  beforeEach(() => request.cookies.clear());

  it.each(['development', 'test'])(
    'exists in %s, and fails only on request',
    async (environment) => {
      where.environment = environment;
      expect(await galleryPage({})).toEqual({ fail: false, unavailable: false });
      expect(await galleryPage({ stav: 'x' })).toEqual({ fail: false, unavailable: false });
      expect(await galleryPage({ stav: 'vyjimka' })).toEqual({ fail: true, unavailable: false });
      expect(await galleryPage({ stav: 'nedostupne' })).toEqual({
        fail: false,
        unavailable: true,
      });
    },
  );

  it('also fails while the cookie asks for it, so a retry can succeed once it is cleared', async () => {
    where.environment = 'test';
    request.cookies.set('vzornik_vyjimka', '1');
    expect(await galleryPage({})).toEqual({ fail: true, unavailable: false });
    request.cookies.set('vzornik_vyjimka', '0');
    expect(await galleryPage({})).toEqual({ fail: false, unavailable: false });
  });

  it('does not exist in production', async () => {
    where.environment = 'production';
    request.cookies.set('vzornik_vyjimka', '1');
    expect(await galleryPage({ stav: 'vyjimka' })).toBeNull();
  });
});

describe('signInPage', () => {
  beforeEach(() => {
    where.environment = 'development';
    where.devServices = { issuer: 'http://localhost:8080/ssps', database: '127.0.0.1:5432' };
  });

  it('shows a known error, and links that come back to a safe path', () => {
    expect(signInPage({ chyba: 'bug', returnTo: '/porada' })).toEqual({
      error: 'bug',
      aadsts: null,
      cause: null,
      technical: null,
      loggedOut: null,
      sharedComputerHint: false,
      loginHref: '/auth/login?returnTo=%2Fporada',
      switchHref: '/auth/login?returnTo=%2Fporada&account=select',
    });
  });

  it('ignores anything it does not know, the old request id among it', () => {
    expect(
      signInPage({
        chyba: '<script>',
        kod: 'abcdef12-3456',
        aadsts: '<b>x</b>',
        pricina: 'evil',
        returnTo: '//evil.example',
        odhlaseno: 'x',
      }),
    ).toEqual({
      error: null,
      aadsts: null,
      cause: null,
      technical: null,
      loggedOut: null,
      sharedComputerHint: false,
      loginHref: '/auth/login?returnTo=%2F',
      switchHref: '/auth/login?returnTo=%2F&account=select',
    });
    expect(signInPage({ chyba: 'failed' }).error).toBeNull();
    expect(signInPage({ odhlaseno: 'vsude' }).loggedOut).toBe('everywhere');
  });

  it('takes the AADSTS number of a refusal', () => {
    expect(signInPage({ chyba: 'idp-refused', aadsts: 'AADSTS50011' })).toMatchObject({
      error: 'idp-refused',
      aadsts: 'AADSTS50011',
    });
  });

  it.each([
    ['text around the number', 'AADSTS50011: redirect URI mismatch'],
    ['too few digits', 'AADSTS1'],
    ['too many digits', 'AADSTS123456789'],
    ['markup', '<b>AADSTS50011</b>'],
    ['lower case', 'aadsts50011'],
  ])('drops an AADSTS value with %s', (_name, aadsts) => {
    expect(signInPage({ chyba: 'idp-refused', aadsts }).aadsts).toBeNull();
  });

  it('takes an AADSTS number only with a refusal', () => {
    expect(signInPage({ chyba: 'unavailable', aadsts: 'AADSTS50011' }).aadsts).toBeNull();
  });

  it('takes the cause of a failed sign-out, and only a known one', () => {
    expect(signInPage({ chyba: 'signout-failed', pricina: 'database-down' }).cause).toBe(
      'database-down',
    );
    expect(signInPage({ chyba: 'signout-failed', pricina: 'network' }).cause).toBeNull();
    expect(signInPage({ chyba: 'bug', pricina: 'database-down' }).cause).toBeNull();
  });

  describe('technical line', () => {
    it.each(['unavailable', 'idp-invalid'])(
      'names the mock IdP and how to start it for %s',
      (chyba) => {
        expect(signInPage({ chyba }).technical).toBe(
          'OIDC issuer http://localhost:8080/ssps (mock IdP, spusťte pnpm dev:services)',
        );
      },
    );

    it('names a remote issuer by origin and path only, without the hint', () => {
      where.devServices = {
        issuer: 'https://user:secret@login.example.org/tenant/v2.0?x=1#y',
        database: undefined,
      };
      const technical = signInPage({ chyba: 'unavailable' }).technical;
      expect(technical).toBe('OIDC issuer https://login.example.org/tenant/v2.0');
    });

    it('names where the database is when it is down', () => {
      expect(signInPage({ chyba: 'database-down' }).technical).toBe(
        'databáze na 127.0.0.1:5432, spusťte pnpm dev:services',
      );
      where.devServices = { issuer: 'http://localhost:8080/ssps', database: undefined };
      expect(signInPage({ chyba: 'database-down' }).technical).toBeNull();
    });

    it.each(['bug', 'idp-refused', 'claims', 'expired', 'signout-failed'])(
      'has none for %s',
      (chyba) => {
        expect(signInPage({ chyba }).technical).toBeNull();
      },
    );

    it.each(['unavailable', 'idp-invalid', 'database-down'])(
      'is never there in production (%s)',
      (chyba) => {
        where.environment = 'production';
        expect(signInPage({ chyba }).technical).toBeNull();
      },
    );

    it('is not there without the development facts', () => {
      where.devServices = undefined;
      expect(signInPage({ chyba: 'unavailable' }).technical).toBeNull();
    });
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
    authTime: new Date('2026-10-24T11:55:00Z'),
  });
  const signedIn = (role: string) => {
    resolvePrincipal.mockResolvedValue(principal(role));
    runRegistered.mockResolvedValue({
      ok: true,
      value: { displayName: 'Jana', role },
    });
  };

  beforeEach(() => {
    resolvePrincipal.mockReset();
    resolvePrincipal.mockResolvedValue(null);
    runRegistered.mockReset();
    redirect.mockClear();
    logged.error.mockClear();
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
    const expected = {
      displayName: 'Jana',
      actor: principal(role).actor,
      pending,
      freshAuth: true,
    };
    expect(await requireSignedIn('/')).toEqual(expected);
    expect(await optionalSignedIn()).toEqual(expected);
  });

  it.each([
    ['just inside the window', '11:50:00', true],
    ['just outside it', '11:49:59', false],
  ])('knows a sign-in %s (the 10 minutes of step-up)', async (_name, at, fresh) => {
    signedIn('headmaster');
    resolvePrincipal.mockResolvedValue({
      ...principal('headmaster'),
      authTime: new Date(`2026-10-24T${at}Z`),
    });
    expect((await requireSignedIn('/')).freshAuth).toBe(fresh);
  });

  it('answers null to a visitor without asking the use case', async () => {
    expect(await optionalSignedIn()).toBeNull();
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('fails loudly when the profile cannot be read, as a bug', async () => {
    resolvePrincipal.mockResolvedValue(principal('pending'));
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'unavailable' } });
    await expect(optionalSignedIn()).rejects.toMatchObject({
      message: 'profile.me: unavailable',
      digest: 'autoporada:bug',
    });
  });

  it('reads a busy profile as a timeout', async () => {
    resolvePrincipal.mockResolvedValue(principal('pending'));
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'busy' } });
    await expect(optionalSignedIn()).rejects.toMatchObject({ digest: 'autoporada:timeout' });
  });

  it.each([
    ['unavailable', 'bug'],
    ['busy', 'timeout'],
    ['not-found', 'bug'],
  ] as const)('logs a %s profile once with the request id, as cause %s', async (code, cause) => {
    resolvePrincipal.mockResolvedValue(principal('pending'));
    runRegistered.mockResolvedValue({ ok: false, error: { code } });
    await expect(optionalSignedIn()).rejects.toMatchObject({ digest: `autoporada:${cause}` });
    expect(logged.error).toHaveBeenCalledTimes(1);
    expect(logged.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'page', reqId: 'req-1', name: 'profile.me', cause }),
      'page failed',
    );
  });

  it('names a lost database when the profile call throws', async () => {
    resolvePrincipal.mockResolvedValue(principal('pending'));
    runRegistered.mockRejectedValue(new DatabaseFailure('08006'));
    await expect(optionalSignedIn()).rejects.toMatchObject({ digest: 'autoporada:database-down' });
    expect(logged.error).toHaveBeenCalledWith(
      expect.objectContaining({ reqId: 'req-1', name: 'profile.me', cause: 'database-down' }),
      'page failed',
    );
  });

  it('names a lost database when the session lookup throws', async () => {
    request.headers = new Headers({ cookie: '__Host-ap_session=tok' });
    resolvePrincipal.mockRejectedValue(new DatabaseFailure('08006'));
    await expect(getViewer()).rejects.toMatchObject({ digest: 'autoporada:database-down' });
    expect(logged.error).toHaveBeenCalledWith(
      expect.objectContaining({ reqId: 'req-1', name: 'auth.session', cause: 'database-down' }),
      'page failed',
    );
  });
});
