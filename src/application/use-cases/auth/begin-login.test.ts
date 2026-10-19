import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SIGN_IN_TTL_MS } from '@/domain/identity';

import { setupWorld } from '../../../../test/support/world';
import { beginLogin, takeSignIn } from './index';
import { beginInput, sha, token } from '../../../../test/support/sign-in';

const world = setupWorld();
const login = system('auth.login');
const callback = system('auth.callback');
const take = (cookie: string) =>
  world.run(takeSignIn, callback, { cookieSha256: sha(cookie), state: token('S') });

describe('auth.beginLogin', () => {
  it('remembers the sign-in for ten minutes, with a safe return path', async () => {
    expect(await world.run(beginLogin, login, beginInput('cookie', '//evil.example'))).toEqual({
      ok: true,
      value: {},
    });
    expect(await take('cookie')).toEqual({
      ok: true,
      value: {
        found: true,
        expired: false,
        purpose: 'login',
        userId: null,
        returnTo: '/',
        startedAtMs: world.clock.now().getTime(),
        nonce: token('N'),
        codeVerifier: token('V'),
      },
    });
  });

  it('clears abandoned sign-ins as new ones start', async () => {
    await world.run(beginLogin, login, beginInput('old'));
    world.clock.advance(SIGN_IN_TTL_MS + 1);
    await world.run(beginLogin, login, beginInput('new'));
    expect(await take('old')).toEqual({ ok: true, value: { found: false } });
  });

  it('accepts digests and protocol tokens only', async () => {
    const raw = { ...beginInput(), cookieSha256: 'the raw cookie' };
    expect(await world.run(beginLogin, login, raw)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('runs only for an anonymous login', async () => {
    await expect(world.run(beginLogin, system('auth.callback'), beginInput())).rejects.toThrow(
      /not for auth.callback/,
    );
    const user = await world.seed.user();
    await expect(world.run(beginLogin, world.as(user), beginInput())).rejects.toThrow(
      /runs as the system/,
    );
  });
});
