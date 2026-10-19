import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import {
  ConstraintViolation,
  LockTimeout,
  system,
  TransactionConflict,
  type Principal,
  type UserRecord,
} from '@/application/ports';
import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';

import { setupWorld } from '../../../test/support/world';
import {
  defineSystemUseCase,
  defineUseCase,
  fail,
  ok,
  runUseCase,
  type AnyUseCase,
  type ResourceAccess,
  type UseCase,
} from './index';

const world = setupWorld();

const countUsers = defineUseCase({
  name: 'test.count',
  mode: 'read',
  input: z.strictObject({ label: z.string().max(10) }),
  output: z.object({ count: z.number() }),
  access: { kind: 'gate', check: () => ({ action: 'review.queue' }) },
  async execute({ tx }) {
    return ok({ count: (await tx.users.list()).length, secret: 'never returned' });
  },
});

/** Changes a user's role; `refuseAfterWrite` returns a failure after writing. */
const promote = defineUseCase({
  name: 'test.promote',
  mode: 'write',
  input: z.strictObject({
    id: z.string().max(36),
    version: z.number().int(),
    refuseAfterWrite: z.boolean().default(false),
  }),
  output: z.object({ role: z.string(), version: z.number() }),
  access: {
    kind: 'resource',
    load: (tx, input) => tx.users.lock(input.id),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'users.manage' }),
  },
  async execute({ tx }, input, user) {
    const after = await tx.users.changeAccess(user.id, user.version, { role: 'reviewer' });
    await tx.audit.record({ action: 'user.role.change', target: { type: 'user', id: user.id } });
    return input.refuseAfterWrite ? fail({ code: 'rule', rule: 'last-headmaster' }) : ok(after);
  },
});

const run = (useCase: AnyUseCase, principal: Principal, input: unknown) =>
  runUseCase(useCase, { principal, requestId: 'req', input: input as never }, world.deps);
const transactions = () => world.fake?.history.length ?? 0;
const users = async () => world.tx(system('cli:test'), (tx) => tx.users.list(), 'read');

describe('the pipeline', () => {
  it('refuses bad input before any transaction', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const before = transactions();
    for (const input of [
      { label: 'x', extra: 1 },
      { label: 'x'.repeat(11) },
      { label: new Date() },
    ]) {
      expect(await run(countUsers, world.as(reviewer), input)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(await run(countUsers, world.as(reviewer), { label: 'x'.repeat(11) })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { label: 'too-long' } },
    });
    expect(transactions()).toBe(before);
  });

  it('checks the gate before taking a connection', async () => {
    const submitter = await world.seed.user({ role: 'submitter' });
    const before = transactions();
    expect(await run(countUsers, world.as(submitter), { label: 'x' })).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(transactions()).toBe(before);
  });

  it('returns only what the output schema names', async () => {
    const reviewer = await world.seed.user({ role: 'reviewer' });
    expect(await run(countUsers, world.as(reviewer), { label: 'x' })).toEqual({
      ok: true,
      value: { count: 1 },
    });
  });

  describe('resource access', () => {
    const setup = async () => ({
      head: await world.seed.user({ role: 'headmaster' }),
      reviewer: await world.seed.user({ role: 'reviewer' }),
      target: await world.seed.user({ role: 'submitter' }),
    });
    const promoteAs = (who: UserRecord, target: UserRecord, extra = {}) =>
      run(promote, world.as(who), { id: target.id, version: target.version, ...extra });

    it('hides rows the actor may not see, before any version or policy check', async () => {
      const { reviewer, target } = await setup();
      expect(await promoteAs(reviewer, target)).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
    });

    it('compares the expected version before the policy', async () => {
      const { reviewer } = await setup();
      const stale = await run(promote, world.as(reviewer), { id: reviewer.id, version: 99 });
      expect(stale).toEqual({ ok: false, error: { code: 'conflict' } });
      expect(await promoteAs(reviewer, reviewer)).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });

    it('asks for a fresh sign-in only after the policy allowed the action', async () => {
      const { head, target } = await setup();
      const stale = world.as(head, {
        authTime: new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS - 1),
      });
      const result = await run(promote, stale, { id: target.id, version: target.version });
      expect(result).toEqual({ ok: false, error: { code: 'step-up-required' } });
      expect(world.fake?.history.at(-1)?.outcome).toBe('rollback');
    });

    it('commits the work and its audit event together', async () => {
      const { head, target } = await setup();
      expect(await promoteAs(head, target)).toEqual({
        ok: true,
        value: { role: 'reviewer', version: target.version + 1 },
      });
      expect((await world.inspect.audit()).map((a) => a.action)).toEqual(['user.role.change']);
    });

    it('rolls back everything when the use case answers with a failure', async () => {
      const { head, target } = await setup();
      const result = await promoteAs(head, target, { refuseAfterWrite: true });
      expect(result).toEqual({ ok: false, error: { code: 'rule', rule: 'last-headmaster' } });
      expect((await users()).find((u) => u.id === target.id)?.role).toBe('submitter');
      expect(await world.inspect.audit()).toEqual([]);
    });

    it.each([
      [new TransactionConflict(), { code: 'conflict' }],
      [new LockTimeout(), { code: 'busy' }],
      [
        new ConstraintViolation('users_active_headmaster'),
        { code: 'rule', rule: 'last-headmaster' },
      ],
    ])('turns %o at commit into a failure', async (error, expected) => {
      const { head, target } = await setup();
      world.fake?.failNext(error);
      expect(await promoteAs(head, target)).toEqual({ ok: false, error: expected });
    });

    it('lets bugs through as exceptions, after rolling back', async () => {
      const { head, target } = await setup();
      const broken = defineUseCase({
        name: 'test.broken',
        mode: 'write',
        input: z.strictObject({}),
        output: z.object({ count: z.number() }),
        access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
        async execute({ tx }) {
          await tx.users.changeAccess(target.id, target.version, { status: 'blocked' });
          await tx.audit.record({ action: 'test.broken', target: { type: 'user', id: target.id } });
          return ok({ count: 'not a number' as unknown as number });
        },
      });
      await expect(run(broken, world.as(head), {})).rejects.toThrow();
      expect((await users()).find((u) => u.id === target.id)?.status).toBe('active');
    });
  });

  it('runs system use cases for system principals only', async () => {
    const seedCount = defineSystemUseCase({
      name: 'test.system',
      reasons: ['cli:test'],
      mode: 'read',
      input: z.strictObject({}),
      output: z.object({ count: z.number() }),
      async execute({ tx }) {
        return ok({ count: (await tx.users.list()).length });
      },
    });
    const user = await world.seed.user({ role: 'headmaster' });
    expect(await run(seedCount, system('cli:test'), {})).toEqual({ ok: true, value: { count: 1 } });
    await expect(run(seedCount, world.as(user), {})).rejects.toThrow(/runs as the system/);
    await expect(run(seedCount, system('job:mail.send'), {})).rejects.toThrow(
      /not for job:mail.send/,
    );
    await expect(run(countUsers, system('cli:test'), { label: 'x' })).rejects.toThrow(
      /signed-in user/,
    );
  });
});

describe('defineUseCase types', () => {
  it('infers the resource from load and makes the version check a decision', () => {
    const resource = defineUseCase({
      name: 'test.types',
      mode: 'read',
      input: z.strictObject({ id: z.string().max(36) }),
      output: z.object({ name: z.string() }),
      access: {
        kind: 'resource',
        load: (tx, input) => tx.users.get(input.id),
        expectedVersion: 'unversioned',
        check: () => ({ action: 'users.manage' }),
      },
      execute: async (_ctx, _input, user) => ok({ name: user.displayName }),
    });
    expectTypeOf(resource).toEqualTypeOf<UseCase<{ id: string }, { name: string }>>();
    // @ts-expect-error: a resource needs a written-down expectedVersion
    const undecided: ResourceAccess<{ id: string }, UserRecord> = {
      kind: 'resource',
      load: async () => null,
      check: () => ({ action: 'users.manage' }),
    };
    void undecided;
  });

  it('refuses a version check on a resource without a version', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const unversioned = defineUseCase({
      name: 'test.noversion',
      mode: 'read',
      input: z.strictObject({ version: z.number() }),
      output: z.object({}),
      access: {
        kind: 'resource',
        load: async () => ({ label: 'no version here' }),
        expectedVersion: (input) => input.version,
        check: () => ({ action: 'issue.edit' }),
      },
      execute: async () => ok({}),
    });
    await expect(run(unversioned, world.as(head), { version: 1 })).rejects.toThrow(/no version/);
  });
});
