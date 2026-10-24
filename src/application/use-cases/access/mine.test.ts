import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { cooldownEnd } from '@/domain/review';

import { setupWorld } from '../../../../test/support/world';
import { myAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);

const standingOf = async (user: UserRecord) => {
  const result = await world.run(myAccess, world.as(user), {});
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value.standing;
};

describe('access.mine', () => {
  it.each(['submitter', 'headmaster'] as const)('says member for a %s', async (role) => {
    const user = await world.seed.user({ role });
    expect(await standingOf(user)).toEqual({ kind: 'member' });
  });

  it('is open with no history', async () => {
    const user = await world.seed.user({ role: 'pending' });
    expect(await standingOf(user)).toEqual({ kind: 'open', previous: null });
  });

  it('is open after a cancelled request', async () => {
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({ userId: user.id, state: 'cancelled', createdAt: daysAgo(1) });
    expect(await standingOf(user)).toEqual({ kind: 'open', previous: 'cancelled' });
  });

  it('is open after a rejection once the cooldown has ended', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({
      userId: user.id,
      state: 'rejected',
      createdAt: daysAgo(41),
      decidedAt: daysAgo(40),
      decidedBy: head.id,
    });
    expect(await standingOf(user)).toEqual({ kind: 'open', previous: 'rejected' });
  });

  it('shows the pending request with its version, reason and creation time', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const createdAt = daysAgo(2);
    const request = await world.seed.accessRequest({
      userId: user.id,
      state: 'pending',
      createdAt,
    });
    expect(await standingOf(user)).toEqual({
      kind: 'pending',
      requestId: request.id,
      version: request.version,
      reason: request.reason,
      createdAt: createdAt.toISOString(),
    });
  });

  it('shows a cooldown with the day it ends', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const decidedAt = daysAgo(5);
    await world.seed.accessRequest({
      userId: user.id,
      state: 'rejected',
      createdAt: daysAgo(6),
      decidedAt,
      decidedBy: head.id,
    });
    expect(await standingOf(user)).toEqual({
      kind: 'cooldown',
      decidedAt: decidedAt.toISOString(),
      until: cooldownEnd(decidedAt).toISOString(),
    });
  });

  it('shows blocked with the decision time', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const decidedAt = daysAgo(3);
    await world.seed.accessRequest({
      userId: user.id,
      state: 'blocked',
      createdAt: daysAgo(4),
      decidedAt,
      decidedBy: head.id,
    });
    expect(await standingOf(user)).toEqual({ kind: 'blocked', decidedAt: decidedAt.toISOString() });
  });

  it('never shows another user’s requests', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const other = await world.seed.user({ role: 'pending' });
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({ userId: other.id, state: 'pending' });
    await world.seed.accessRequest({
      userId: other.id,
      state: 'blocked',
      createdAt: daysAgo(9),
      decidedBy: head.id,
    });
    expect(await standingOf(user)).toEqual({ kind: 'open', previous: null });
  });

  it('writes no audit row', async () => {
    const user = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({ userId: user.id, state: 'pending' });
    await standingOf(user);
    expect(await world.inspect.audit()).toEqual([]);
  });
});
