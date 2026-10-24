import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../support/world';

const world = setupWorld();

/** Resolves once `parties` callers have arrived; later arrivals pass straight through. */
function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release: () => void = () => undefined;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    if (++arrived >= parties) release();
    return open;
  };
}

describe('at least one active headmaster, through the repos', () => {
  it('stops two headmasters demoting each other at once', async () => {
    const a = await world.seed.user({ role: 'headmaster' });
    const b = await world.seed.user({ role: 'headmaster' });
    const bothUpdated = barrier(2);
    const demote = (by: UserRecord, target: UserRecord) =>
      world.tx(world.as(by), async (tx) => {
        await tx.users.changeAccess(target.id, target.version, { role: 'reviewer' });
        await tx.audit.record({
          action: 'user.role.change',
          target: { type: 'user', id: target.id },
        });
        await bothUpdated();
      });
    const results = await Promise.allSettled([demote(a, b), demote(b, a)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.reason).toMatchObject({
      name: 'ConstraintViolation',
      constraint: 'users_active_headmaster',
    });
    const left = await world.tx(
      system('test.seed'),
      (tx) => tx.users.countActiveHeadmasters(),
      'read',
    );
    expect(left).toBe(1);
  });
});
