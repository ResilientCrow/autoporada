import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { searchGate } from './index';

const world = setupWorld();

const gate = (by: UserRecord, input: unknown = {}) => world.run(searchGate, world.as(by), input);

describe('people.searchGate', () => {
  it.each([
    ['a submitter', { role: 'submitter' }],
    ['a student submitter', { role: 'submitter', tier: 'student' }],
    ['a reviewer', { role: 'reviewer' }],
    ['the headmaster', { role: 'headmaster' }],
  ] as const)('lets %s search, and answers nothing', async (_, seed) => {
    expect(await gate(await world.seed.user(seed))).toEqual({ ok: true, value: {} });
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
  ] as const)('refuses a %s user', async (_, seed) => {
    expect(await gate(await world.seed.user(seed))).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('refuses any input', async () => {
    const got = await gate(await world.seed.user({ role: 'submitter' }), { q: 'nov' });
    expect(got).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('cannot run for the system', async () => {
    await expect(world.run(searchGate, system('cli:test'), {})).rejects.toThrow(
      'people.searchGate: runs as a signed-in user',
    );
  });
});
