import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { beginStepUp, takeSignIn } from './index';
import { beginInput, sha, token } from '../../../../test/support/sign-in';

const world = setupWorld();

describe('auth.beginStepUp', () => {
  it('binds the step-up to the signed-in user', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    expect(await world.run(beginStepUp, world.as(user), beginInput())).toEqual({
      ok: true,
      value: {},
    });
    const taken = await world.run(takeSignIn, system('auth.callback'), {
      cookieSha256: sha('cookie'),
      state: token('S'),
    });
    expect(taken).toMatchObject({
      ok: true,
      value: { found: true, purpose: 'step_up', userId: user.id },
    });
  });

  it('refuses blocked accounts', async () => {
    const blocked = await world.seed.user({ role: 'reviewer', status: 'blocked' });
    expect(await world.run(beginStepUp, world.as(blocked), beginInput())).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });
});
