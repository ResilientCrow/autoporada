import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineUseCase, ok, runUseCase } from '@/application/core';

import { setupWorld } from '../../support/world';

const world = setupWorld();

/** Demotes without checking the rule first, so only the trigger can stop it. */
const demote = defineUseCase({
  name: 'test.demote',
  mode: 'write',
  input: z.strictObject({ id: z.string().max(36), version: z.number().int() }),
  output: z.object({ role: z.string() }),
  access: {
    kind: 'resource',
    load: (tx, input) => tx.users.lock(input.id),
    expectedVersion: (input) => input.version,
    check: () => ({ action: 'users.manage' }),
  },
  async execute({ tx }, _input, user) {
    const after = await tx.users.changeAccess(user.id, user.version, { role: 'reviewer' });
    await tx.audit.record({ action: 'user.role.change', target: { type: 'user', id: user.id } });
    return ok(after);
  },
});

describe('the pipeline on PostgreSQL', () => {
  it('reports the last-headmaster trigger at COMMIT as a rule, and keeps nothing', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const result = await runUseCase(
      demote,
      {
        principal: world.as(head),
        requestId: 'req',
        input: { id: head.id, version: head.version },
      },
      world.deps,
    );
    expect(result).toEqual({ ok: false, error: { code: 'rule', rule: 'last-headmaster' } });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('demotes a headmaster while another one remains', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.user({ role: 'headmaster' });
    const result = await runUseCase(
      demote,
      {
        principal: world.as(head),
        requestId: 'req',
        input: { id: head.id, version: head.version },
      },
      world.deps,
    );
    expect(result).toEqual({ ok: true, value: { role: 'reviewer' } });
    expect((await world.inspect.audit()).map((a) => [a.action, a.requestId])).toEqual([
      ['user.role.change', 'req'],
    ]);
  });
});
