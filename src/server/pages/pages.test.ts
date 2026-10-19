import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getViewer, signInPage } from './index';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
const resolvePrincipal = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../container', () => ({
  getContainer: () => ({ resolvePrincipal, requestIdFrom: () => 'req-1' }),
}));

describe('signInPage', () => {
  it('shows known errors with their code, and links that come back to a safe path', () => {
    expect(signInPage({ chyba: 'failed', kod: 'abcdef12-3456', returnTo: '/porada' })).toEqual({
      error: 'failed',
      code: 'abcdef12-3456',
      loggedOut: null,
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
      loginHref: '/auth/login?returnTo=%2F',
      switchHref: '/auth/login?returnTo=%2F&account=select',
    });
    expect(signInPage({ odhlaseno: 'vsude' }).loggedOut).toBe('everywhere');
  });
});

describe('signInPage after signing out', () => {
  it.each([{ odhlaseno: '1' }, { odhlaseno: 'vsude' }, { chyba: 'signout-failed' }])(
    'offers the account picker on the main button too (%o)',
    (params) => {
      expect(signInPage(params).loginHref).toBe('/auth/login?returnTo=%2F&account=select');
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
