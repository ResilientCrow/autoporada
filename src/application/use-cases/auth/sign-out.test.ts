import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { signedIn } from '../../../../test/support/sessions';
import { sha } from '../../../../test/support/sign-in';
import { setupWorld } from '../../../../test/support/world';
import { signOut } from './index';

const world = setupWorld();
const live = (token: string) =>
  world.tx(
    system('auth.session'),
    async (tx) => (await tx.sessions.find(sha(token))) !== null,
    'read',
  );

describe('auth.signOut', () => {
  it('ends this session, or every session of the user, and audits it', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const here = await signedIn(world, user.id, 'here');
    await signedIn(world, user.id, 'phone');
    const as = { ...world.as(user), sessionId: here.id };
    expect(await world.run(signOut, as, { everywhere: false })).toEqual({
      ok: true,
      value: { ended: 1 },
    });
    expect([await live('here'), await live('phone')]).toEqual([false, true]);
    expect(await world.run(signOut, as, { everywhere: true })).toEqual({
      ok: true,
      value: { ended: 1 },
    });
    expect(await live('phone')).toBe(false);
    const logouts = (await world.inspect.audit()).filter((a) => a.action === 'auth.logout');
    expect(logouts.map((a) => a.data['meta'])).toEqual([
      { everywhere: false },
      { everywhere: true },
    ]);
  });

  it('never ends another user’s sessions', async () => {
    const me = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    const theirs = await signedIn(world, other.id, 'theirs');
    await world.run(signOut, { ...world.as(me), sessionId: theirs.id }, { everywhere: false });
    expect(await live('theirs')).toBe(true);
  });
});
