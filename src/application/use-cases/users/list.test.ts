import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { listUsers } from './index';

const world = setupWorld();

const list = (user: UserRecord, input: unknown = {}, authTime?: Date) =>
  world.run(listUsers, world.as(user, authTime ? { authTime } : {}), input);

describe('users.list', () => {
  it('lists every user for a headmaster, in name order, with the default group all', async () => {
    const head = await world.seed.user({ role: 'headmaster', displayName: 'Ředitel' });
    const blocked = await world.seed.user({
      role: 'submitter',
      status: 'blocked',
      displayName: 'Alena',
    });
    const result = await list(head);
    if (!result.ok) throw new Error(`refused: ${result.error.code}`);
    expect(result.value.total).toBe(2);
    expect(result.value.users).toEqual([
      {
        id: blocked.id,
        displayName: 'Alena',
        email: null,
        role: 'submitter',
        status: 'blocked',
        isStudent: false,
      },
      {
        id: head.id,
        displayName: 'Ředitel',
        email: null,
        role: 'headmaster',
        status: 'active',
        isStudent: false,
      },
    ]);
  });

  it('filters by group and search', async () => {
    const head = await world.seed.user({ role: 'headmaster', displayName: 'Ředitel' });
    await world.seed.user({ role: 'reviewer', displayName: 'Jana Nováková' });
    await world.seed.user({ role: 'submitter', displayName: 'Petr Novák' });
    const result = await list(head, { q: ' NOVAK ', group: 'reviewer' });
    expect(result).toMatchObject({ ok: true, value: { total: 1 } });
    const all = await list(head, { q: 'novak' });
    expect(all).toMatchObject({ ok: true, value: { total: 2 } });
  });

  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    expect(await list(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('refuses an unknown group', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const result = await list(head, { group: 'nobody' });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('needs no fresh sign-in to read', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const stale = new Date(world.clock.now().getTime() - 20 * 60_000);
    expect((await list(head, {}, stale)).ok).toBe(true);
  });

  it('writes no audit row', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await list(head);
    expect(await world.inspect.audit()).toEqual([]);
  });
});
