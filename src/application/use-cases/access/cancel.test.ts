import { describe, expect, it } from 'vitest';

import type { AccessRequestRecord, UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { cancelAccess, requestAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);

const cancel = (user: UserRecord, input: unknown) => world.run(cancelAccess, world.as(user), input);
const cancelOf = (user: UserRecord, request: AccessRequestRecord) =>
  cancel(user, { requestId: request.id, version: request.version });
const history = (user: UserRecord) =>
  world.tx(world.as(user), (tx) => tx.accessRequests.forUser(user.id), 'read');

/** A pending user with one pending request, filed yesterday. */
async function pendingRequest() {
  const user = await world.seed.user({ role: 'pending' });
  const request = await world.seed.accessRequest({
    userId: user.id,
    state: 'pending',
    createdAt: daysAgo(1),
  });
  return { user, request };
}

describe('access.cancel', () => {
  it('cancels the request now, decided by nobody, and audits it without the text', async () => {
    const { user, request } = await pendingRequest();
    expect(await cancelOf(user, request)).toEqual({ ok: true, value: {} });
    expect(await history(user)).toEqual([
      { ...request, state: 'cancelled', decidedAt: world.clock.now(), version: 2 },
    ]);
    const audit = await world.inspect.audit();
    expect(audit).toEqual([
      {
        actorId: user.id,
        action: 'access.cancel',
        targetType: 'access_request',
        targetId: request.id,
        data: {
          diff: { state: { from: 'pending', to: 'cancelled' } },
          related: [{ type: 'user', id: user.id }],
        },
        requestId: 'test',
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain(request.reason);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('lets the requester ask again after cancelling', async () => {
    const { user, request } = await pendingRequest();
    expect((await cancelOf(user, request)).ok).toBe(true);
    const asked = await world.run(requestAccess, world.as(user), { reason: 'Znovu.' });
    expect(asked.ok).toBe(true);
    expect((await history(user)).map((r) => r.state)).toEqual(['pending', 'cancelled']);
  });

  it('finds no request of another person, nor one that does not exist', async () => {
    const { request } = await pendingRequest();
    const other = await world.seed.user({ role: 'pending' });
    expect(await cancelOf(other, request)).toEqual({ ok: false, error: { code: 'not-found' } });
    const guessed = { requestId: '0190f6a0-0000-7000-8000-00000000abcd', version: 1 };
    expect(await cancel(other, guessed)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a form that is out of date', async () => {
    const { user, request } = await pendingRequest();
    expect(await cancelOf(user, { ...request, version: 2 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect((await history(user))[0]?.state).toBe('pending');
  });

  it.each(['cancelled', 'rejected', 'blocked'] as const)(
    'refuses a request that is already %s',
    async (state) => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'pending' });
      const request = await world.seed.accessRequest({
        userId: user.id,
        state,
        createdAt: daysAgo(3),
        ...(state !== 'cancelled' && { decidedBy: head.id }),
      });
      expect(await cancelOf(user, request)).toEqual({ ok: false, error: { code: 'conflict' } });
      expect(await history(user)).toEqual([request]);
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('refuses someone who already has access, even on their own old request', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const request = await world.seed.accessRequest({
      userId: user.id,
      state: 'approved',
      createdAt: daysAgo(3),
      decidedBy: head.id,
    });
    expect(await cancelOf(user, request)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it.each([
    ['an id that is not a uuid', { requestId: 'abc', version: 1 }, { requestId: 'invalid' }],
    ['no version', { requestId: '0190f6a0-0000-7000-8000-00000000abcd' }, { version: 'required' }],
    [
      'a version below one',
      { requestId: '0190f6a0-0000-7000-8000-00000000abcd', version: 0 },
      { version: 'invalid' },
    ],
  ])('refuses %s', async (_case, input, fields) => {
    const { user } = await pendingRequest();
    expect(await cancel(user, input)).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields },
    });
  });
});
