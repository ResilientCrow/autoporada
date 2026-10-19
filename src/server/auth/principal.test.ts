import { describe, expect, it } from 'vitest';

import { signedIn } from '../../../test/support/sessions';
import { setupWorld } from '../../../test/support/world';
import { principalResolver } from './principal';
import { digest, isToken, newToken } from './tokens';

const world = setupWorld();

describe('principalResolver', () => {
  it('turns a live session cookie into the signed-in user', async () => {
    const user = await world.seed.user({ role: 'reviewer' });
    const token = newToken();
    // The helper stores sha256(token), which is exactly digest(token).
    const session = await signedIn(world, user.id, token);
    const principal = await principalResolver(world.deps)(token, 'req');
    expect(principal).toEqual({
      kind: 'user',
      actor: { id: user.id, role: 'reviewer', status: 'active', isStudent: false },
      sessionId: session.id,
      authTime: world.clock.now(),
    });
  });

  it('never looks up a cookie that is not a well-formed token', async () => {
    const before = world.fake?.history.length ?? 0;
    for (const token of [null, '', 'short', `${'a'.repeat(42)}!`, 'a'.repeat(44)]) {
      expect(await principalResolver(world.deps)(token, 'req')).toBeNull();
    }
    expect(world.fake?.history.length ?? 0).toBe(before);
  });

  it('makes 256-bit tokens and stores only their SHA-256', () => {
    const token = newToken();
    expect(isToken(token)).toBe(true);
    expect(digest(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken()).not.toBe(token);
  });
});
