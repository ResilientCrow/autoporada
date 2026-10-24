import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { ACCESS_REASON_MAX, cooldownEnd } from '@/domain/review';

import { setupWorld } from '../../../../test/support/world';
import { requestAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);
const REASON = 'Učím fyziku a\u00A0potřebuji psát hodnocení.';

const ask = (user: UserRecord, reason = REASON) =>
  world.run(requestAccess, world.as(user), { reason });
const history = (user: UserRecord) =>
  world.tx(world.as(user), (tx) => tx.accessRequests.forUser(user.id), 'read');

describe('access.request', () => {
  it('files a pending request at the world’s clock and audits it without the text', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const result = await ask(user, `  ${REASON}  `);
    if (!result.ok) throw new Error(`refused: ${result.error.code}`);
    const { requestId } = result.value;
    expect(await history(user)).toEqual([
      {
        id: requestId,
        userId: user.id,
        reason: REASON,
        state: 'pending',
        decidedBy: null,
        decidedAt: null,
        version: 1,
        createdAt: world.clock.now(),
      },
    ]);
    const audit = await world.inspect.audit();
    expect(audit).toEqual([
      {
        actorId: user.id,
        action: 'access.request',
        targetType: 'access_request',
        targetId: requestId,
        data: {
          diff: { state: { from: null, to: 'pending' } },
          related: [{ type: 'user', id: user.id }],
        },
        requestId: 'test',
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain('fyziku');
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('takes a reason of exactly the maximum length', async () => {
    const user = await world.seed.user({ role: 'pending' });
    expect((await ask(user, 'a'.repeat(ACCESS_REASON_MAX))).ok).toBe(true);
  });

  it.each([
    ['empty', { reason: '' }, 'required'],
    ['whitespace only', { reason: ' \n\t ' }, 'required'],
    ['over the maximum', { reason: 'a'.repeat(ACCESS_REASON_MAX + 1) }, 'too-long'],
    ['missing', {}, 'required'],
    ['not text', { reason: 42 }, 'invalid'],
  ])('refuses a reason that is %s', async (_case, input, code) => {
    const user = await world.seed.user({ role: 'pending' });
    expect(await world.run(requestAccess, world.as(user), input)).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { reason: code } },
    });
    expect(await history(user)).toEqual([]);
  });

  it.each(['submitter', 'headmaster'] as const)('refuses a %s: they have access', async (role) => {
    const user = await world.seed.user({ role });
    expect(await ask(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a blocked account', async () => {
    const user = await world.seed.user({ role: 'pending', status: 'blocked' });
    expect(await ask(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('finds nobody to file for when the user row is gone', async () => {
    const user = await world.seed.user({ role: 'pending' });
    const gone = { ...user, id: '00000000-0000-7000-8000-00000000ffff' };
    expect(await ask(gone)).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  describe('by the requester’s standing', () => {
    const refusedWith = async (user: UserRecord, rule: string) => {
      const before = await history(user);
      expect(await ask(user)).toEqual({ ok: false, error: { code: 'rule', rule } });
      expect(await history(user)).toEqual(before);
      expect(await world.inspect.audit()).toEqual([]);
    };

    it('refuses while a request is pending', async () => {
      const user = await world.seed.user({ role: 'pending' });
      await world.seed.accessRequest({ userId: user.id, state: 'pending' });
      await refusedWith(user, 'request-pending');
    });

    it('refuses until the cooldown after a rejection ends, then takes the request', async () => {
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
      await refusedWith(user, 'request-cooldown');
      world.clock.set(new Date(cooldownEnd(decidedAt).getTime() - 1));
      await refusedWith(user, 'request-cooldown');
      world.clock.set(cooldownEnd(decidedAt));
      expect((await ask(user)).ok).toBe(true);
    });

    it('refuses for good once any request was blocked', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'pending' });
      await world.seed.accessRequest({
        userId: user.id,
        state: 'blocked',
        createdAt: daysAgo(400),
        decidedBy: head.id,
      });
      await world.seed.accessRequest({
        userId: user.id,
        state: 'cancelled',
        createdAt: daysAgo(2),
      });
      await refusedWith(user, 'request-blocked');
    });

    it('takes a new request after a cancelled one', async () => {
      const user = await world.seed.user({ role: 'pending' });
      await world.seed.accessRequest({
        userId: user.id,
        state: 'cancelled',
        createdAt: daysAgo(1),
      });
      const result = await ask(user);
      expect(result.ok).toBe(true);
      expect((await history(user)).map((r) => r.state)).toEqual(['pending', 'cancelled']);
      expect(await world.inspect.jobs()).toEqual([]);
    });
  });
});
