import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { me } from './index';
import { setReminders } from './set-reminders';

const world = setupWorld();

const set = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(setReminders, world.as(by), input);
const stored = (id: string) => world.tx(system('test.seed'), (tx) => tx.users.get(id), 'read');

describe('profile.setReminders', () => {
  it('starts with the reminders on', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(user.remindDeadline).toBe(true);
    expect(await world.run(me, world.as(user), {})).toMatchObject({
      ok: true,
      value: { remindDeadline: true },
    });
  });

  it('switches the reminders off and on again, and shows it in me', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(await set(user, { on: false })).toEqual({ ok: true, value: { changed: true } });
    expect((await stored(user.id))?.remindDeadline).toBe(false);
    expect(await world.run(me, world.as(user), {})).toMatchObject({
      ok: true,
      value: { remindDeadline: false },
    });
    expect(await set(user, { on: true })).toEqual({ ok: true, value: { changed: true } });
    expect((await stored(user.id))?.remindDeadline).toBe(true);
  });

  it('audits a change with the new state, and nothing else', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const before = (await world.inspect.audit()).length;
    await set(user, { on: false });
    const audit = await world.inspect.audit();
    expect(audit).toHaveLength(before + 1);
    expect(audit.at(-1)).toMatchObject({
      action: 'profile.reminders',
      targetId: user.id,
      data: { meta: { on: false } },
    });
  });

  it('writes and audits nothing when the state is already the one asked for', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const before = await world.inspect.audit();
    expect(await set(user, { on: true })).toEqual({ ok: true, value: { changed: false } });
    expect(await world.inspect.audit()).toEqual(before);
    expect(await stored(user.id)).toEqual(user);
  });

  it('is not an access change: the version and the sessions stay', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    await set(user, { on: false });
    expect((await stored(user.id))?.version).toBe(user.version);
  });

  it('changes only the signed-in user’s own setting', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.user({ role: 'submitter' });
    await set(user, { on: false });
    expect((await stored(other.id))?.remindDeadline).toBe(true);
  });

  it('is open to a student and to a user waiting for approval', async () => {
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    const pending = await world.seed.user({ role: 'pending' });
    expect(await set(student, { on: false })).toEqual({ ok: true, value: { changed: true } });
    expect(await set(pending, { on: false })).toEqual({ ok: true, value: { changed: true } });
  });

  it('refuses a blocked user', async () => {
    const user = await world.seed.user({ role: 'submitter', status: 'blocked' });
    expect(await set(user, { on: false })).toMatchObject({ ok: false });
    expect((await stored(user.id))?.remindDeadline).toBe(true);
  });

  it.each([{}, { on: 'ne' }, { on: false, extra: 1 }])('refuses the input %j', async (input) => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(await set(user, input)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
