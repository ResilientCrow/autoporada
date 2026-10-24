import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { getUser } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);

const get = (by: UserRecord, userId: string, authTime?: Date) =>
  world.run(getUser, world.as(by, authTime ? { authTime } : {}), { userId });
const read = async (by: UserRecord, target: UserRecord) => {
  const result = await get(by, target.id);
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value;
};

describe('users.get', () => {
  it('reads a user with no request and offers the grantable roles', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const value = await read(head, user);
    expect(value).toEqual({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: null,
        jobTitle: null,
        department: null,
        role: 'submitter',
        status: 'active',
        isStudent: false,
        version: user.version,
        createdAt: user.createdAt.toISOString(),
      },
      isSelf: false,
      choices: {
        roles: ['submitter', 'reviewer', 'headmaster'],
        audience: true,
        statuses: ['active', 'blocked'],
      },
      request: null,
      requestEvents: [],
    });
  });

  it('shows a pending request, its events, and no role choices', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const request = await world.seed.accessRequest({
      userId: user.id,
      state: 'pending',
      createdAt: daysAgo(2),
    });
    const value = await read(head, user);
    expect(value.choices).toEqual({ roles: [], audience: false, statuses: ['active', 'blocked'] });
    expect(value.request).toEqual({
      requestId: request.id,
      version: request.version,
      state: 'pending',
      reason: request.reason,
      createdAt: daysAgo(2).toISOString(),
      decidedAt: null,
    });
    expect(value.requestEvents).toEqual(['approve', 'reject', 'block']);
  });

  it('offers pending first, and the audience, to a pending user with no request', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const value = await read(head, user);
    expect(value.choices).toEqual({
      roles: ['pending', 'submitter', 'reviewer', 'headmaster'],
      audience: true,
      statuses: ['active', 'blocked'],
    });
    expect(value.requestEvents).toEqual([]);
  });

  it('allows only a block after a rejection', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({
      userId: user.id,
      state: 'rejected',
      createdAt: daysAgo(3),
      decidedAt: daysAgo(2),
      decidedBy: head.id,
    });
    const value = await read(head, user);
    expect(value.requestEvents).toEqual(['block']);
    expect(value.request).toMatchObject({ state: 'rejected', decidedAt: daysAgo(2).toISOString() });
    expect(value.choices.roles).toEqual(['pending', 'submitter', 'reviewer', 'headmaster']);
  });

  it('offers nothing on one’s own account', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const value = await read(head, head);
    expect(value.isSelf).toBe(true);
    expect(value.choices).toEqual({ roles: [], audience: false, statuses: [] });
  });

  it('keeps a deactivated status on offer', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter', status: 'deactivated' });
    expect((await read(head, user)).choices.statuses).toEqual(['active', 'blocked', 'deactivated']);
  });

  it('needs no fresh sign-in to read', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const stale = new Date(world.clock.now().getTime() - 20 * 60_000);
    expect((await get(head, user.id, stale)).ok).toBe(true);
  });

  it('hides other users from a submitter, and refuses them their own', async () => {
    const submitter = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    expect(await get(submitter, other.id)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await get(submitter, submitter.id)).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('finds nobody for an unknown id', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await get(head, '00000000-0000-7000-8000-00000000ffff')).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('writes no audit row', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({ userId: user.id, state: 'pending' });
    await read(head, user);
    expect(await world.inspect.audit()).toEqual([]);
  });
});
