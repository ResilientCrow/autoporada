import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';

import { signedIn } from '../../../../test/support/sessions';
import { sha } from '../../../../test/support/sign-in';
import { setupWorld } from '../../../../test/support/world';
import { setFunctions } from './index';

const world = setupWorld();
const RANDOM_ID = '0190f6a0-0000-7000-8000-00000000abcd';
const MAJETEK = { head: 'zastupce', complement: 'pro majetek' } as const;
const IT = { head: 'vedouci', complement: 'IT oddělení' } as const;
const CLEN = { head: 'clen', complement: null } as const;

const ask = (
  by: UserRecord,
  target: UserRecord,
  functions: readonly unknown[],
  extra: Record<string, unknown> = {},
  authTime?: Date,
) =>
  world.run(setFunctions, world.as(by, authTime ? { authTime } : {}), {
    userId: target.id,
    version: target.version,
    functions,
    ...extra,
  });

const stored = (id: string) =>
  world.tx(system('test.seed'), async (tx) => (await tx.users.functions([id])).get(id), 'read');
const rowOf = (id: string) => world.tx(system('test.seed'), (tx) => tx.users.get(id), 'read');

describe('users.setFunctions', () => {
  it('replaces the list in the given order and answers with the new version', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter', tier: 'ucitel' });

    expect(await ask(head, user, [IT, MAJETEK, CLEN])).toEqual({
      ok: true,
      value: { changed: true, version: user.version + 1 },
    });
    expect(await stored(user.id)).toEqual([IT, MAJETEK, CLEN]);
    expect(await rowOf(user.id)).toMatchObject({ role: 'submitter', tier: 'ucitel' });
  });

  it('audits the heads only, never the complement', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const logged = (await world.inspect.audit()).length;

    await ask(head, user, [IT, MAJETEK]);

    const audit = (await world.inspect.audit()).slice(logged);
    expect(audit).toEqual([
      {
        actorId: head.id,
        action: 'user.functions.change',
        targetType: 'user',
        targetId: user.id,
        data: { meta: { heads: ['vedouci', 'zastupce'] } },
        requestId: 'test',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/majetek|IT odd/);
  });

  it('trims the complement and stores an empty one as none', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await ask(head, user, [
      { head: 'vedouci', complement: '  IT oddělení ' },
      { head: 'clen', complement: '  ' },
    ]);
    expect(await stored(user.id)).toEqual([IT, CLEN]);
  });

  it('allows any tier, a student too, and a user without a tier', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    for (const tier of ['student', 'absolvent', 'ucitel', null] as const) {
      const user = await world.seed.user({ role: 'submitter', tier });
      expect(await ask(head, user, [{ head: 'clen', complement: 'PR oddělení' }])).toMatchObject({
        ok: true,
      });
      expect(await stored(user.id)).toHaveLength(1);
    }
  });

  it('allows the headmaster’s own row: a function grants no rights', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await ask(head, head, [MAJETEK])).toMatchObject({ ok: true });
    expect(await stored(head.id)).toEqual([MAJETEK]);
    expect(await rowOf(head.id)).toMatchObject({ role: 'headmaster', status: 'active' });
  });

  it('writes nothing when the list is unchanged, and keeps the version', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const first = await ask(head, user, [IT]);
    if (!first.ok) throw new Error('setup failed');
    const logged = (await world.inspect.audit()).length;

    const again = await world.run(setFunctions, world.as(head), {
      userId: user.id,
      version: first.value.version,
      functions: [{ head: 'vedouci', complement: ' IT oddělení' }],
    });

    expect(again).toEqual({ ok: true, value: { changed: false, version: first.value.version } });
    expect((await world.inspect.audit()).length).toBe(logged);
    expect((await rowOf(user.id))?.version).toBe(first.value.version);
  });

  it('removes every function with an empty list, and an empty list on none changes nothing', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    expect(await ask(head, user, [])).toEqual({
      ok: true,
      value: { changed: false, version: user.version },
    });
    const first = await ask(head, user, [IT]);
    if (!first.ok) throw new Error('setup failed');
    await world.run(setFunctions, world.as(head), {
      userId: user.id,
      version: first.value.version,
      functions: [],
    });
    expect(await stored(user.id)).toBeUndefined();
  });

  it('refuses more than five functions and writes nothing', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const result = await ask(head, user, Array(6).fill(CLEN));
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await stored(user.id)).toBeUndefined();
    expect(await ask(head, user, Array(5).fill(CLEN))).toMatchObject({ ok: true });
  });

  it('refuses an unknown head and a complement with a line break', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    for (const bad of [
      { head: 'reditel', complement: null },
      { head: 'clen', complement: 'a\nb' },
    ]) {
      expect(await ask(head, user, [bad])).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(await stored(user.id)).toBeUndefined();
  });

  it('asks for a fresh sign-in first: step-up-required', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    const stale = new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS - 1);
    expect(await ask(head, user, [IT], {}, stale)).toEqual({
      ok: false,
      error: { code: 'step-up-required' },
    });
    expect(await stored(user.id)).toBeUndefined();
    const fresh = new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS);
    expect(await ask(head, user, [IT], {}, fresh)).toMatchObject({ ok: true });
  });

  it('is forbidden to a reviewer, and hidden users are not-found', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const user = await world.seed.user({ role: 'submitter' });
    expect(await ask(reviewer, user, [IT])).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await ask(user, user, [IT])).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await ask(reviewer, reviewer, [IT])).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
    const head = await world.seed.user({ role: 'headmaster' });
    expect(
      await world.run(setFunctions, world.as(head), {
        userId: RANDOM_ID,
        version: 1,
        functions: [IT],
      }),
    ).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  it('refuses a stale version: conflict', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await ask(head, user, [IT]);
    expect(await ask(head, user, [MAJETEK])).toEqual({ ok: false, error: { code: 'conflict' } });
    expect(await stored(user.id)).toEqual([IT]);
  });

  it('signs nobody out', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'submitter' });
    await signedIn(world, user.id, 'target');
    await ask(head, user, [IT]);
    const live = await world.tx(
      system('auth.session'),
      async (tx) => (await tx.sessions.find(sha('target'))) !== null,
      'read',
    );
    expect(live).toBe(true);
  });
});
