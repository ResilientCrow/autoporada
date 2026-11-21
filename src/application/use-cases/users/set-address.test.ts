import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { setAddress } from './index';

const world = setupWorld();

const ask = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(setAddress, world.as(by), input);
const row = (id: string) => world.tx(system('test.seed'), (tx) => tx.users.get(id), 'read');

describe('users.setAddress', () => {
  it('stores the salutation on the own row and audits the fields only', async () => {
    const user = await world.seed.user({ role: 'submitter', tier: 'ucitel' });
    const logged = (await world.inspect.audit()).length;

    const result = await ask(user, { salutation: 'pani' });

    expect(result).toEqual({ ok: true, value: { changed: true } });
    expect(await row(user.id)).toMatchObject({
      salutation: 'pani',
      version: user.version,
    });
    const audit = (await world.inspect.audit()).slice(logged);
    expect(audit).toEqual([
      {
        actorId: user.id,
        action: 'user.address.change',
        targetType: 'user',
        targetId: user.id,
        data: { meta: { fields: ['salutation'] } },
        requestId: 'test',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/pani/);
  });

  it('writes nothing when the salutation did not change', async () => {
    const user = await world.seed.user({ role: 'submitter', salutation: 'pan' });
    const logged = (await world.inspect.audit()).length;

    expect(await ask(user, { salutation: 'pan' })).toEqual({ ok: true, value: { changed: false } });
    expect(await world.inspect.audit()).toHaveLength(logged);

    expect(await ask(user, { salutation: 'pani' })).toEqual({ ok: true, value: { changed: true } });
    expect((await world.inspect.audit()).slice(logged).map((a) => a.data)).toEqual([
      { meta: { fields: ['salutation'] } },
    ]);
  });

  it.each([
    ['an employee', { tier: 'ucitel' as const }, 'slecna'],
    ['a person without a tier', {}, 'slecna'],
    ['a student', { tier: 'student' as const }, 'pani'],
    ['an absolvent', { tier: 'absolvent' as const }, 'pani'],
  ])('refuses the wrong salutation for %s', async (_who, seed, salutation) => {
    const user = await world.seed.user({ role: 'submitter', ...seed });
    const logged = (await world.inspect.audit()).length;
    expect(await ask(user, { salutation })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { salutation: 'invalid' } },
    });
    expect(await row(user.id)).toMatchObject({ salutation: null });
    expect(await world.inspect.audit()).toHaveLength(logged);
  });

  it.each([
    ['a student', 'student', 'slecna'],
    ['an absolvent', 'absolvent', 'pan'],
    ['an employee', 'zamestnanec', 'pani'],
  ] as const)('takes the right salutation for %s', async (_who, tier, salutation) => {
    const user = await world.seed.user({ role: 'submitter', tier });
    await ask(user, { salutation });
    expect(await row(user.id)).toMatchObject({ salutation });
  });

  it('asks again when a changed tier no longer fits the salutation', async () => {
    const user = await world.seed.user({ role: 'submitter', tier: 'ucitel' });
    await ask(user, { salutation: 'pani' });
    const head = await world.seed.user({ role: 'headmaster' });
    await world.tx(world.as(head), async (tx) => {
      const current = (await tx.users.lock(user.id))!;
      const after = await tx.users.changeAccess(user.id, current.version, { tier: 'student' });
      await tx.audit.record({
        action: 'user.access.change',
        target: { type: 'user', id: after.id },
      });
    });
    const student = (await row(user.id))!;
    expect(await ask(student, { salutation: 'pani' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it.each([
    ['a missing salutation', {}],
    ['a null salutation', { salutation: null }],
    ['an unknown salutation', { salutation: 'pane' }],
    [
      'a degree before the name, which the school does not use',
      { salutation: 'pan', titlesBefore: 'Mgr.' },
    ],
    ['a degree after the name', { salutation: 'pan', titlesAfter: 'Ph.D.' }],
    ['another user’s id', { salutation: 'pan', userId: 'x' }],
  ])('refuses %s as invalid input', async (_name, input) => {
    const user = await world.seed.user({ role: 'submitter' });
    const result = await ask(user, input);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await row(user.id)).toMatchObject({ salutation: null });
  });

  it('is open to every active user with an account, a pending one included, and shut to a blocked one', async () => {
    for (const role of ['pending', 'submitter', 'reviewer', 'headmaster'] as const) {
      const user = await world.seed.user({ role });
      expect(await ask(user, { salutation: 'pan' })).toEqual({
        ok: true,
        value: { changed: true },
      });
    }
    const blocked = await world.seed.user({ role: 'submitter', status: 'blocked' });
    expect(await ask(blocked, { salutation: 'pan' })).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(await row(blocked.id)).toMatchObject({ salutation: null });
  });

  it('never touches another user’s row', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    await ask(head, { salutation: 'pan' });
    expect(await row(user.id)).toMatchObject({ salutation: null });
  });
});
