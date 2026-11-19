import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { setAddress } from './index';

const world = setupWorld();

const ask = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(setAddress, world.as(by), input);
const row = (id: string) => world.tx(system('test.seed'), (tx) => tx.users.get(id), 'read');

describe('users.setAddress', () => {
  it('stores the salutation and the degrees, trimmed, on the own row and audits the fields only', async () => {
    const user = await world.seed.user({ role: 'submitter', tier: 'ucitel' });
    const logged = (await world.inspect.audit()).length;

    const result = await ask(user, {
      salutation: 'pani',
      titlesBefore: '  Mgr. ',
      titlesAfter: 'Ph.D.',
    });

    expect(result).toEqual({ ok: true, value: { changed: true } });
    expect(await row(user.id)).toMatchObject({
      salutation: 'pani',
      titlesBefore: 'Mgr.',
      titlesAfter: 'Ph.D.',
      version: user.version,
    });
    const audit = (await world.inspect.audit()).slice(logged);
    expect(audit).toEqual([
      {
        actorId: user.id,
        action: 'user.address.change',
        targetType: 'user',
        targetId: user.id,
        data: { meta: { fields: ['salutation', 'titlesBefore', 'titlesAfter'] } },
        requestId: 'test',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/Mgr|Ph\.D|pani/);
  });

  it('names only the fields that changed, and writes nothing when none did', async () => {
    const user = await world.seed.user({
      role: 'submitter',
      salutation: 'pan',
      titlesBefore: 'Ing.',
    });
    const logged = (await world.inspect.audit()).length;

    expect(await ask(user, { salutation: 'pan', titlesBefore: 'Ing.', titlesAfter: null })).toEqual(
      { ok: true, value: { changed: false } },
    );
    expect(await world.inspect.audit()).toHaveLength(logged);

    expect(await ask(user, { salutation: 'pan', titlesBefore: null, titlesAfter: 'MBA' })).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect((await world.inspect.audit()).slice(logged).map((a) => a.data)).toEqual([
      { meta: { fields: ['titlesBefore', 'titlesAfter'] } },
    ]);
  });

  it.each([
    ['', null],
    ['   ', null],
    ['Mgr.', 'Mgr.'],
  ])('turns the degree %j into %j', async (typed, stored) => {
    const user = await world.seed.user({ role: 'submitter' });
    await ask(user, { salutation: 'pan', titlesBefore: typed, titlesAfter: typed });
    expect(await row(user.id)).toMatchObject({ titlesBefore: stored, titlesAfter: stored });
  });

  it.each([
    ['an employee', { tier: 'ucitel' as const }, 'slecna'],
    ['a person without a tier', {}, 'slecna'],
    ['a student', { tier: 'student' as const }, 'pani'],
    ['an absolvent', { tier: 'absolvent' as const }, 'pani'],
  ])('refuses the wrong salutation for %s', async (_who, seed, salutation) => {
    const user = await world.seed.user({ role: 'submitter', ...seed });
    const logged = (await world.inspect.audit()).length;
    expect(await ask(user, { salutation, titlesBefore: null, titlesAfter: null })).toEqual({
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
    await ask(user, { salutation, titlesBefore: null, titlesAfter: null });
    expect(await row(user.id)).toMatchObject({ salutation });
  });

  it('asks again when a changed tier no longer fits the salutation', async () => {
    const user = await world.seed.user({ role: 'submitter', tier: 'ucitel' });
    await ask(user, { salutation: 'pani', titlesBefore: null, titlesAfter: null });
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
    expect(
      await ask(student, { salutation: 'pani', titlesBefore: null, titlesAfter: null }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it.each([
    ['a missing salutation', { titlesBefore: null, titlesAfter: null }],
    ['a null salutation', { salutation: null, titlesBefore: null, titlesAfter: null }],
    ['an unknown salutation', { salutation: 'pane', titlesBefore: null, titlesAfter: null }],
    [
      'a degree over 40 characters',
      { salutation: 'pan', titlesBefore: 'x'.repeat(41), titlesAfter: null },
    ],
    [
      'a line break in a degree',
      { salutation: 'pan', titlesBefore: 'Mgr.\nIng.', titlesAfter: null },
    ],
    ['a tab in a degree', { salutation: 'pan', titlesBefore: null, titlesAfter: 'Ph.\tD.' }],
    [
      'another user’s id',
      { salutation: 'pan', titlesBefore: null, titlesAfter: null, userId: 'x' },
    ],
  ])('refuses %s as invalid input', async (_name, input) => {
    const user = await world.seed.user({ role: 'submitter' });
    const result = await ask(user, input);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await row(user.id)).toMatchObject({ salutation: null, titlesBefore: null });
  });

  it('drops control characters and direction marks, as the pipeline does for every input', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    await ask(user, { salutation: 'pan', titlesBefore: 'Mgr.\u0007', titlesAfter: '\u202EPh.D.' });
    expect(await row(user.id)).toMatchObject({ titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' });
  });

  it('accepts a degree of exactly 40 characters', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const title = 'x'.repeat(40);
    expect(await ask(user, { salutation: 'pan', titlesBefore: title, titlesAfter: null })).toEqual({
      ok: true,
      value: { changed: true },
    });
  });

  it('is open to every active user with an account, a pending one included, and shut to a blocked one', async () => {
    for (const role of ['pending', 'submitter', 'reviewer', 'headmaster'] as const) {
      const user = await world.seed.user({ role });
      expect(await ask(user, { salutation: 'pan', titlesBefore: null, titlesAfter: null })).toEqual(
        { ok: true, value: { changed: true } },
      );
    }
    const blocked = await world.seed.user({ role: 'submitter', status: 'blocked' });
    expect(
      await ask(blocked, { salutation: 'pan', titlesBefore: null, titlesAfter: null }),
    ).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await row(blocked.id)).toMatchObject({ salutation: null });
  });

  it('never touches another user’s row', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    await ask(head, { salutation: 'pan', titlesBefore: 'Mgr.', titlesAfter: null });
    expect(await row(user.id)).toMatchObject({ salutation: null, titlesBefore: null });
  });
});
