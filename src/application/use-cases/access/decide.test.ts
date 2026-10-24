import { describe, expect, it } from 'vitest';

import { system, type AccessRequestRecord, type UserRecord } from '@/application/ports';

import { signedIn } from '../../../../test/support/sessions';
import { sha } from '../../../../test/support/sign-in';
import { setupWorld } from '../../../../test/support/world';
import { decideAccess, requestAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);
const RANDOM_ID = '0190f6a0-0000-7000-8000-00000000abcd';

/** A headmaster and a pending user whose request, filed yesterday, waits for them. */
async function setup() {
  const head = await world.seed.user({ role: 'headmaster', displayName: 'Ředitelka' });
  const user = await world.seed.user({ role: 'pending' });
  const request = await world.seed.accessRequest({
    userId: user.id,
    state: 'pending',
    createdAt: daysAgo(1),
  });
  return { head, user, request };
}

const decide = (
  by: UserRecord,
  request: Pick<AccessRequestRecord, 'id' | 'version'>,
  decision: string,
  extra: Record<string, unknown> = {},
) =>
  world.run(decideAccess, world.as(by), {
    requestId: request.id,
    version: request.version,
    decision,
    ...extra,
  });

/** The requester's row, their requests and the audit log, as the system sees them. */
const snapshot = (userId: string) =>
  world.tx(
    system('test.seed'),
    async (tx) => ({
      user: await tx.users.get(userId),
      requests: await tx.accessRequests.forUser(userId),
      audit: await world.inspect.audit(),
    }),
    'read',
  );

const live = (token: string) =>
  world.tx(
    system('auth.session'),
    async (tx) => (await tx.sessions.find(sha(token))) !== null,
    'read',
  );

/** Expects `run` to fail with `error` and to change nothing anywhere. */
async function refuses(userId: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(userId);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(userId)).toEqual(before);
}

describe('access.decide', () => {
  it.each([
    ['approve-staff', false],
    ['approve-student', true],
  ] as const)(
    '%s: approves, sets the audience and ends the requester’s sessions',
    async (decision, isStudent) => {
      const { head, user, request } = await setup();
      await signedIn(world, user.id, 'requester');
      const logged = (await world.inspect.audit()).length;

      expect(await decide(head, request, decision)).toEqual({
        ok: true,
        value: { state: 'approved' },
      });

      const after = await snapshot(user.id);
      expect(after.requests).toEqual([
        {
          ...request,
          state: 'approved',
          decidedBy: head.id,
          decidedAt: world.clock.now(),
          version: 2,
        },
      ]);
      expect(after.user).toMatchObject({ role: 'submitter', isStudent, version: user.version + 1 });
      const audit = after.audit.slice(logged);
      expect(audit).toEqual([
        {
          actorId: head.id,
          action: 'access.approve',
          targetType: 'access_request',
          targetId: request.id,
          data: {
            diff: {
              state: { from: 'pending', to: 'approved' },
              decidedBy: { from: null, to: head.id },
            },
            related: [{ type: 'user', id: user.id }],
          },
          requestId: 'test',
        },
        {
          actorId: head.id,
          action: 'user.access.change',
          targetType: 'user',
          targetId: user.id,
          data: {
            diff: {
              role: { from: 'pending', to: 'submitter' },
              ...(isStudent && { isStudent: { from: false, to: true } }),
            },
            meta: { via: 'access.approve' },
          },
          requestId: 'test',
        },
      ]);
      expect(JSON.stringify(audit)).not.toContain(request.reason);
      expect(await live('requester')).toBe(false);
      expect(await world.inspect.jobs()).toEqual([]);
    },
  );

  it('rejects: the user stays as they were and waits out the cooldown', async () => {
    const { head, user, request } = await setup();
    await signedIn(world, user.id, 'requester');
    const logged = (await world.inspect.audit()).length;

    expect(await decide(head, request, 'reject')).toEqual({
      ok: true,
      value: { state: 'rejected' },
    });

    const after = await snapshot(user.id);
    expect(after.user).toEqual(user);
    expect(after.requests).toEqual([
      {
        ...request,
        state: 'rejected',
        decidedBy: head.id,
        decidedAt: world.clock.now(),
        version: 2,
      },
    ]);
    expect(after.audit.slice(logged)).toEqual([
      {
        actorId: head.id,
        action: 'access.reject',
        targetType: 'access_request',
        targetId: request.id,
        data: {
          diff: {
            state: { from: 'pending', to: 'rejected' },
            decidedBy: { from: null, to: head.id },
          },
          related: [{ type: 'user', id: user.id }],
        },
        requestId: 'test',
      },
    ]);
    expect(await live('requester')).toBe(true);
    expect(await world.inspect.jobs()).toEqual([]);
    expect(await world.run(requestAccess, world.as(user), { reason: 'Znovu.' })).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'request-cooldown' },
    });
  });

  it('blocks only when confirmed, and then no further request is taken', async () => {
    const { head, user, request } = await setup();
    await refuses(user.id, () => decide(head, request, 'block'), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });

    expect(await decide(head, request, 'block', { confirmed: true })).toEqual({
      ok: true,
      value: { state: 'blocked' },
    });
    const after = await snapshot(user.id);
    expect(after.user).toEqual(user);
    expect(after.requests[0]).toMatchObject({ state: 'blocked', decidedBy: head.id, version: 2 });
    expect(after.audit.map((a) => [a.action, a.data['diff']])).toEqual([
      [
        'access.block',
        { state: { from: 'pending', to: 'blocked' }, decidedBy: { from: null, to: head.id } },
      ],
    ]);
    expect(await world.inspect.jobs()).toEqual([]);
    expect(await world.run(requestAccess, world.as(user), { reason: 'Znovu.' })).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'request-blocked' },
    });
  });

  it('blocks a request that was already rejected', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const rejected = await world.seed.accessRequest({
      userId: user.id,
      state: 'rejected',
      createdAt: daysAgo(3),
      decidedAt: daysAgo(2),
      decidedBy: head.id,
    });
    expect(await decide(head, rejected, 'block', { confirmed: true })).toEqual({
      ok: true,
      value: { state: 'blocked' },
    });
    expect((await snapshot(user.id)).audit.map((a) => [a.action, a.data['diff']])).toEqual([
      ['access.block', { state: { from: 'rejected', to: 'blocked' } }],
    ]);
  });

  it('refuses a second decision, from the old form and from the new one', async () => {
    const { head, user, request } = await setup();
    expect((await decide(head, request, 'approve-staff')).ok).toBe(true);
    const conflict = { code: 'conflict' };
    await refuses(user.id, () => decide(head, request, 'reject'), conflict);
    await refuses(user.id, () => decide(head, { ...request, version: 2 }, 'reject'), conflict);
    await refuses(
      user.id,
      () => decide(head, { ...request, version: 2 }, 'block', { confirmed: true }),
      conflict,
    );
  });

  it('refuses to decide a request that is not the user’s newest', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    const old = await world.seed.accessRequest({
      userId: user.id,
      state: 'rejected',
      createdAt: daysAgo(60),
      decidedAt: daysAgo(55),
      decidedBy: head.id,
    });
    await world.seed.accessRequest({ userId: user.id, state: 'pending', createdAt: daysAgo(1) });
    await refuses(user.id, () => decide(head, old, 'block', { confirmed: true }), {
      code: 'conflict',
    });
  });

  it('refuses an approval once the user is no longer pending', async () => {
    const { head, user, request } = await setup();
    await world.tx(system('test.seed'), (tx) =>
      tx.users.changeAccess(user.id, user.version, { role: 'submitter' }),
    );
    for (const decision of ['approve-staff', 'approve-student']) {
      await refuses(user.id, () => decide(head, request, decision), { code: 'conflict' });
    }
  });

  it('forbids the requester to decide their own request, which they can see', async () => {
    const { user, request } = await setup();
    await refuses(user.id, () => decide(user, request, 'approve-staff'), { code: 'forbidden' });
  });

  it('shows another person’s request to no one but a headmaster: the rest get not-found', async () => {
    const { head, user, request } = await setup();
    const submitter = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const blockedHead = await world.seed.user({ role: 'headmaster', status: 'blocked' });
    // A session from before the flag: students never decide, even as a stale headmaster.
    const studentHead = { ...head, isStudent: true };
    for (const by of [submitter, reviewer, blockedHead, studentHead]) {
      await refuses(user.id, () => decide(by, request, 'approve-staff'), { code: 'not-found' });
    }
  });

  it('finds no request behind a guessed id', async () => {
    const { head, user } = await setup();
    await refuses(user.id, () => decide(head, { id: RANDOM_ID, version: 1 }, 'reject'), {
      code: 'not-found',
    });
  });

  it.each([
    ['an unknown decision', { decision: 'approve' }, { decision: 'invalid' }],
    // Zod reports a missing enum value as invalid_value, which reads as 'invalid'.
    ['no decision', { decision: undefined }, { decision: 'invalid' }],
    ['confirmed: false', { decision: 'block', confirmed: false }, { confirmed: 'invalid' }],
    ['a version below one', { decision: 'reject', version: 0 }, { version: 'invalid' }],
    [
      'an id that is not a uuid',
      { decision: 'reject', requestId: 'abc' },
      { requestId: 'invalid' },
    ],
  ])('refuses %s', async (_case, patch, fields) => {
    const { head, user, request } = await setup();
    const input = { requestId: request.id, version: request.version, ...patch };
    await refuses(user.id, () => world.run(decideAccess, world.as(head), input), {
      code: 'invalid-input',
      fields,
    });
  });
});
