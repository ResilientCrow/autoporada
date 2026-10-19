import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { recordRejection } from './index';

const world = setupWorld();

describe('auth.recordRejection', () => {
  it('audits why a verified sign-in was refused, never who it was', async () => {
    const result = await world.run(recordRejection, system('auth.callback'), {
      reason: 'guest',
      claim: 'acct',
      signals: ['acct', 'upn'],
      purpose: 'login',
      userId: null,
    });
    expect(result).toEqual({ ok: true, value: {} });
    expect(await world.inspect.audit()).toEqual([
      {
        actorId: null,
        action: 'auth.rejected',
        targetType: null,
        targetId: null,
        data: {
          meta: { reason: 'guest', claim: 'acct', signals: ['acct', 'upn'], purpose: 'login' },
          system: 'auth.callback',
        },
        requestId: 'test',
      },
    ]);
  });

  it('names the user when a step-up was refused', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    await world.run(recordRejection, system('auth.callback'), {
      reason: 'stale-auth',
      claim: 'auth_time',
      signals: [],
      purpose: 'step_up',
      userId: user.id,
    });
    expect((await world.inspect.audit())[0]).toMatchObject({
      targetType: 'user',
      targetId: user.id,
    });
  });
});
