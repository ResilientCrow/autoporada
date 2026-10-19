import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SIGN_IN_TTL_MS } from '@/domain/identity';

import { setupWorld } from '../../../../test/support/world';
import { beginLogin, takeSignIn } from './index';
import { beginInput, sha, token } from '../../../../test/support/sign-in';

const world = setupWorld();
const take = (state = token('S')) =>
  world.run(takeSignIn, system('auth.callback'), { cookieSha256: sha('cookie'), state });

describe('auth.takeSignIn', () => {
  it('hands a sign-in out once', async () => {
    await world.run(beginLogin, system('auth.login'), beginInput());
    expect(await take()).toMatchObject({ ok: true, value: { found: true, expired: false } });
    expect(await take()).toEqual({ ok: true, value: { found: false } });
  });

  it('keeps the sign-in when the state is foreign', async () => {
    await world.run(beginLogin, system('auth.login'), beginInput());
    expect(await take(token('X'))).toEqual({ ok: true, value: { found: false } });
    expect(await take()).toMatchObject({ ok: true, value: { found: true } });
  });

  it('uses up an expired sign-in too, and says it expired', async () => {
    await world.run(beginLogin, system('auth.login'), beginInput());
    world.clock.advance(SIGN_IN_TTL_MS);
    expect(await take()).toMatchObject({ ok: true, value: { found: true, expired: true } });
    expect(await take()).toEqual({ ok: true, value: { found: false } });
  });
});
