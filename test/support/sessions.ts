import { system } from '@/application/ports';
import { newSessionTimes } from '@/domain/identity';

import { sha } from './sign-in';
import type { World } from './world';

/** A session for `userId`, created and audited as a sign-in would. */
export function signedIn(world: World, userId: string, token: string) {
  return world.tx(system('auth.callback'), async (tx) => {
    const session = await tx.sessions.create({
      tokenSha256: sha(token),
      userId,
      authTime: world.clock.now(),
      ...newSessionTimes(world.clock.now()),
    });
    await tx.audit.record({
      action: 'auth.login',
      target: { type: 'user', id: userId },
      related: [{ type: 'session', id: session.id }],
    });
    return session;
  });
}
