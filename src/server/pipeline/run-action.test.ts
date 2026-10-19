import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineSystemUseCase, defineUseCase, ok } from '@/application/core';
import { DatabaseFailure, type UserPrincipal } from '@/application/ports';

import { recordingLog } from '../../../test/support/log';
import { setupWorld } from '../../../test/support/world';
import { createRateLimiter, LIMITS } from '../rate-limit';
import { defineAction, runAction, wrappedInfo, type ActionDeps } from './index';

const world = setupWorld();

const echo = defineUseCase({
  name: 'test.echo',
  mode: 'read',
  input: z.strictObject({ text: z.string().max(100) }),
  output: z.object({ length: z.number() }),
  access: { kind: 'gate', check: () => ({ action: 'directory.search' }) },
  execute: async (_ctx, input) => ok({ length: input.text.length }),
});

function deps(principal: UserPrincipal | null, max = 30) {
  const { lines, log } = recordingLog();
  const actionDeps: ActionDeps = {
    app: world.deps,
    useCases: new Set([echo]),
    resolvePrincipal: async (token) => (token === 'good' ? principal : null),
    limiter: createRateLimiter({
      limits: { ...LIMITS, directory: { ...LIMITS.directory, max } },
      now: () => 0,
    }),
    log,
  };
  return { actionDeps, lines };
}
const request = (sessionToken: string | null) => ({ sessionToken, requestId: 'req-1' });
const SECRET = 'Jana Nováková, 2.B';

describe('runAction', () => {
  it('answers unauthenticated without a session and opens no transaction', async () => {
    const { actionDeps } = deps(null);
    const result = await runAction(
      actionDeps,
      request(null),
      echo,
      { rateLimit: 'none' },
      {
        text: SECRET,
      },
    );
    expect(result).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(world.fake?.history).toEqual([]);
  });

  it('runs the use case as the signed-in user and logs one line without the input', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const { actionDeps, lines } = deps(world.as(user));
    const result = await runAction(
      actionDeps,
      request('good'),
      echo,
      { rateLimit: 'directory' },
      {
        text: SECRET,
      },
    );
    expect(result).toEqual({ ok: true, data: { length: SECRET.length } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      fields: {
        kind: 'action',
        name: 'test.echo',
        reqId: 'req-1',
        actorId: user.id,
        outcome: 'ok',
      },
    });
    expect(JSON.stringify(lines)).not.toContain('Jana');
  });

  it('rate-limits per user before the input is even read', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const { actionDeps, lines } = deps(world.as(user), 1);
    const call = () =>
      runAction(actionDeps, request('good'), echo, { rateLimit: 'directory' }, { text: 'x' });
    await call();
    const before = world.fake?.history.length;
    expect(await call()).toEqual({
      ok: false,
      error: { code: 'rate-limited', retryAfterSeconds: 60 },
    });
    expect(world.fake?.history.length).toBe(before);
    expect(lines.at(-1)).toMatchObject({ level: 'warn', fields: { outcome: 'rate-limited' } });
  });

  it('answers unavailable with the request id when something breaks, logging the SQLSTATE only', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const { actionDeps, lines } = deps(world.as(user));
    world.fake?.failNext(new DatabaseFailure('08000'));
    const result = await runAction(
      actionDeps,
      request('good'),
      echo,
      { rateLimit: 'none' },
      {
        text: SECRET,
      },
    );
    expect(result).toEqual({ ok: false, error: { code: 'unavailable', requestId: 'req-1' } });
    expect(lines.find((l) => l.level === 'error')?.fields).toMatchObject({
      err: { name: 'DatabaseFailure', sqlstate: '08000' },
    });
    expect(JSON.stringify(lines)).not.toContain('Jana');
  });
});

describe('runAction and the registry', () => {
  it('answers unavailable for a use case that is not registered', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const { actionDeps, lines } = deps(world.as(user));
    const unlisted = defineUseCase({
      name: 'test.unlisted',
      mode: 'read',
      input: z.strictObject({}),
      output: z.object({}),
      access: { kind: 'gate', check: () => ({ action: 'directory.search' }) },
      execute: async () => ok({}),
    });
    const result = await runAction(
      actionDeps,
      request('good'),
      unlisted,
      { rateLimit: 'none' },
      {},
    );
    expect(result).toEqual({ ok: false, error: { code: 'unavailable', requestId: 'req-1' } });
    expect(lines.find((l) => l.level === 'error')?.fields).toMatchObject({
      err: { message: 'test.unlisted: not in USE_CASES' },
    });
    expect(world.fake?.history).toEqual([expect.objectContaining({ outcome: 'commit' })]);
  });
});

describe('defineAction', () => {
  it('brands what it makes, and nothing else', () => {
    const action = defineAction(echo, { rateLimit: 'directory' });
    expect(wrappedInfo(action)).toEqual({ kind: 'action', useCase: echo, rateLimit: 'directory' });
    expect(wrappedInfo(async () => ({ ok: true }))).toBeUndefined();
  });

  it('refuses system use cases', () => {
    const job = defineSystemUseCase({
      name: 'test.job',
      reasons: ['job:test'],
      mode: 'read',
      input: z.strictObject({}),
      output: z.object({}),
      execute: async () => ok({}),
    });
    expect(() => defineAction(job, { rateLimit: 'none' })).toThrow(/signed-in user/);
  });
});
