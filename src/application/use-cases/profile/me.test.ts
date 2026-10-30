import { describe, expect, it } from 'vitest';

import { setupWorld } from '../../../../test/support/world';
import { me } from './index';

const world = setupWorld();

describe('profile.me', () => {
  it('tells the signed-in user who they are', async () => {
    const user = await world.seed.user({ displayName: 'Jana Nováková' });
    expect(await world.run(me, world.as(user), {})).toEqual({
      ok: true,
      value: {
        displayName: 'Jana Nováková',
        role: 'pending',
        isStudent: false,
        remindDeadline: true,
      },
    });
  });
});
