import { describe, expect, it } from 'vitest';

import { signInPage } from './index';

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
