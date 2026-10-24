import { describe, expect, it } from 'vitest';

import { mailJob } from '@/application/notifications';
import { system, type UserRecord } from '@/application/ports';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';

import { signedIn } from '../../../../test/support/sessions';
import { sha } from '../../../../test/support/sign-in';
import { setupWorld } from '../../../../test/support/world';
import { changeUserAccess } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(world.clock.now().getTime() - days * DAY);
const RANDOM_ID = '0190f6a0-0000-7000-8000-00000000abcd';
const CONFIRMED = { confirmed: true } as const;

/** The form as it starts for `target`: its current access, with `patch` on top. */
const form = (target: UserRecord, patch: Record<string, unknown> = {}) => ({
  userId: target.id,
  version: target.version,
  role: target.role,
  audience: target.isStudent ? 'student' : 'staff',
  status: target.status,
  ...patch,
});

const change = (
  by: UserRecord,
  target: UserRecord,
  patch: Record<string, unknown> = {},
  authTime?: Date,
) => world.run(changeUserAccess, world.as(by, authTime ? { authTime } : {}), form(target, patch));

/** The target's row, their requests, the audit log and the queue, as the system sees them. */
const snapshot = (userId: string) =>
  world.tx(
    system('test.seed'),
    async (tx) => ({
      user: await tx.users.get(userId),
      requests: await tx.accessRequests.forUser(userId),
      audit: await world.inspect.audit(),
      jobs: await world.inspect.jobs(),
    }),
    'read',
  );

const userOf = async (id: string) => (await snapshot(id)).user;

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

const changed = { ok: true, value: { changed: true } };

describe('users.changeAccess', () => {
  it('promotes a submitter, audits the change and ends their sessions', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await signedIn(world, user.id, 'target');
    const logged = (await world.inspect.audit()).length;

    expect(await change(head, user, { role: 'reviewer' })).toEqual(changed);

    const after = await snapshot(user.id);
    expect(after.user).toMatchObject({ role: 'reviewer', isStudent: false, status: 'active' });
    expect(after.user?.version).toBe(user.version + 1);
    expect(after.audit.slice(logged)).toEqual([
      {
        actorId: head.id,
        action: 'user.access.change',
        targetType: 'user',
        targetId: user.id,
        data: {
          diff: { role: { from: 'submitter', to: 'reviewer' } },
          meta: { via: 'users.changeAccess' },
        },
        requestId: 'test',
      },
    ]);
    expect(await live('target')).toBe(false);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('asks a headmaster who signed in too long ago to sign in again, then lets them', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const stale = new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS - 1);
    await refuses(user.id, () => change(head, user, { role: 'reviewer' }, stale), {
      code: 'step-up-required',
    });
    const fresh = new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS);
    expect(await change(head, user, { role: 'reviewer' }, fresh)).toEqual(changed);
  });

  it('forbids a headmaster to change their own account', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    await refuses(head.id, () => change(head, head, { role: 'reviewer', ...CONFIRMED }), {
      code: 'forbidden',
    });
    await refuses(head.id, () => change(head, head), { code: 'forbidden' });
  });

  it.each([
    ['a member back to pending', { role: 'submitter' }, { role: 'pending', ...CONFIRMED }],
    [
      'an active account to deactivated',
      { role: 'submitter' },
      { status: 'deactivated', ...CONFIRMED },
    ],
  ] as const)('forbids what the form never offers: %s', async (_case, seed, patch) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user(seed);
    await refuses(user.id, () => change(head, user, patch), { code: 'forbidden' });
  });

  describe('a pending user with a pending request', () => {
    async function setup() {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'pending' });
      await world.seed.accessRequest({ userId: user.id, state: 'pending', createdAt: daysAgo(1) });
      return { head, user };
    }

    it.each([
      ['a role', { role: 'submitter' }],
      ['the audience', { audience: 'student' }],
    ])('keeps %s for the request’s decision: conflict', async (_case, patch) => {
      const { head, user } = await setup();
      await refuses(user.id, () => change(head, user, patch), { code: 'conflict' });
    });

    it('may still have the account blocked, and the request stays', async () => {
      const { head, user } = await setup();
      expect(await change(head, user, { status: 'blocked', ...CONFIRMED })).toEqual(changed);
      const after = await snapshot(user.id);
      expect(after.user).toMatchObject({ role: 'pending', status: 'blocked' });
      expect(after.requests.map((r) => r.state)).toEqual(['pending']);
    });
  });

  it.each([
    ['who never asked', null, 'staff'],
    ['after a cancelled request', 'cancelled', 'student'],
    ['after a rejected request', 'rejected', 'staff'],
    ['after a blocked request', 'blocked', 'student'],
  ] as const)('grants access by hand to a pending user %s', async (_case, state, audience) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    if (state) {
      await world.seed.accessRequest({
        userId: user.id,
        state,
        createdAt: daysAgo(3),
        ...(state !== 'cancelled' && { decidedBy: head.id }),
      });
    }
    const logged = (await world.inspect.audit()).length;
    expect(await change(head, user, { role: 'submitter', audience })).toEqual(changed);
    const isStudent = audience === 'student';
    const after = await snapshot(user.id);
    expect(after.user).toMatchObject({ role: 'submitter', isStudent });
    const { data, dedupeKey } = mailJob('access.granted', {
      userId: user.id,
      versionAfter: user.version + 1,
    });
    expect(dedupeKey).toBe(`access.granted:${user.id}:${user.version + 1}`);
    expect(after.jobs).toEqual([{ name: 'mail.send', data, options: { dedupeKey } }]);
    expect(after.audit.slice(logged).map((a) => a.data['diff'])).toEqual([
      {
        role: { from: 'pending', to: 'submitter' },
        ...(isStudent && { isStudent: { from: false, to: true } }),
      },
    ]);
  });

  it.each([
    ['a promotion', { role: 'submitter' }, { role: 'reviewer' }],
    ['a demotion', { role: 'reviewer' }, { role: 'submitter', ...CONFIRMED }],
    ['a block', { role: 'submitter' }, { status: 'blocked', ...CONFIRMED }],
    ['a change of audience', { role: 'submitter' }, { audience: 'student' }],
    ['an unblock', { role: 'submitter', status: 'blocked' }, { status: 'active' }],
    ['a block of a pending user', { role: 'pending' }, { status: 'blocked', ...CONFIRMED }],
  ] as const)(
    'mails nobody about %s: only a grant out of pending is told',
    async (_case, seed, patch) => {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user(seed);
      expect(await change(head, user, patch)).toEqual(changed);
      expect(await world.inspect.jobs()).toEqual([]);
    },
  );

  it('keeps a student a submitter: rule student-role, unless they become staff', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter', isStudent: true });
    await refuses(user.id, () => change(head, user, { role: 'reviewer' }), {
      code: 'rule',
      rule: 'student-role',
    });
    expect(await change(head, user, { role: 'reviewer', audience: 'staff' })).toEqual(changed);
  });

  it.each([
    ['a demotion', { role: 'reviewer' }, { role: 'submitter' }],
    ['a headmaster made reviewer', { role: 'headmaster' }, { role: 'reviewer' }],
    ['a block', { role: 'submitter' }, { status: 'blocked' }],
  ] as const)('asks to confirm %s, and makes it once confirmed', async (_case, seed, patch) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user(seed);
    await refuses(user.id, () => change(head, user, patch), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
    expect(await change(head, user, { ...patch, ...CONFIRMED })).toEqual(changed);
    expect(await userOf(user.id)).toMatchObject(patch);
  });

  it.each([
    ['an unblock', { role: 'submitter', status: 'blocked' }, { status: 'active' }],
    ['a promotion to headmaster', { role: 'submitter' }, { role: 'headmaster' }],
  ] as const)('needs no confirmation for %s', async (_case, seed, patch) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user(seed);
    expect(await change(head, user, patch)).toEqual(changed);
    expect(await userOf(user.id)).toMatchObject(patch);
  });

  it.each([
    ['an active submitter', { role: 'submitter' }],
    ['a deactivated reviewer, kept deactivated', { role: 'reviewer', status: 'deactivated' }],
  ] as const)('writes nothing when the form changes nothing: %s', async (_case, seed) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user(seed);
    const before = await snapshot(user.id);
    expect(await change(head, user, CONFIRMED)).toEqual({ ok: true, value: { changed: false } });
    expect(await snapshot(user.id)).toEqual(before);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('refuses a form that is out of date', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await refuses(
      user.id,
      () => change(head, user, { role: 'reviewer', version: user.version + 1 }),
      {
        code: 'conflict',
      },
    );
  });

  it('hides other users from a non-headmaster (not-found), and forbids their own row', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    for (const role of ['submitter', 'reviewer'] as const) {
      const by = await world.seed.user({ role });
      await refuses(user.id, () => change(by, user, { role: 'reviewer' }), { code: 'not-found' });
    }
    await refuses(user.id, () => change(user, user, { role: 'reviewer' }), { code: 'forbidden' });
  });

  it('finds nobody behind a guessed id', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await refuses(user.id, () => change(head, user, { userId: RANDOM_ID, role: 'reviewer' }), {
      code: 'not-found',
    });
  });

  it.each([
    ['demoted', { role: 'reviewer' }],
    ['blocked', { status: 'blocked' }],
  ] as const)(
    'forbids a session from before the headmaster was %s, by the locked row',
    async (_case, patch) => {
      const head = await world.seed.user({ role: 'headmaster' });
      // A second headmaster stays, so the change to `head` commits.
      await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ role: 'submitter' });
      await world.tx(system('test.seed'), (tx) =>
        tx.users.changeAccess(head.id, head.version, patch),
      );
      // `head` is the record the session was resolved from: still an active headmaster.
      await refuses(user.id, () => change(head, user, { role: 'reviewer' }), {
        code: 'forbidden',
      });
    },
  );

  it('keeps the last headmaster from a demoted one’s old session: forbidden, not the rule', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const other = await world.seed.user({ role: 'headmaster' });
    // The other headmaster demoted `head` a moment ago; head's session still says headmaster.
    // The database's last-headmaster check stays the backstop (test/integration/app/pipeline.test.ts).
    await world.tx(system('test.seed'), (tx) =>
      tx.users.changeAccess(head.id, head.version, { role: 'reviewer' }),
    );
    await refuses(other.id, () => change(head, other, { role: 'reviewer', ...CONFIRMED }), {
      code: 'forbidden',
    });
  });

  it.each([
    ['an unknown role', { role: 'admin' }, { role: 'invalid' }],
    ['an unknown audience', { audience: 'parent' }, { audience: 'invalid' }],
    ['an unknown status', { status: 'gone' }, { status: 'invalid' }],
    ['confirmed: false', { confirmed: false }, { confirmed: 'invalid' }],
    ['a version below one', { version: 0 }, { version: 'invalid' }],
    ['an id that is not a uuid', { userId: 'abc' }, { userId: 'invalid' }],
  ])('refuses %s', async (_case, patch, fields) => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await refuses(user.id, () => change(head, user, patch), { code: 'invalid-input', fields });
  });
});
