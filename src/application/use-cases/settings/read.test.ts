import { describe, expect, it } from 'vitest';

import { readSettingValue } from '@/application/core';
import { DatabaseFailure, system } from '@/application/ports';
import { SETTINGS } from '@/contracts';

import { setupWorld } from '../../../../test/support/world';
import { readSettings } from './index';

const world = setupWorld();

const read = (user: Parameters<typeof world.as>[0], input: unknown = {}) =>
  world.run(readSettings, world.as(user), input);

const DEFAULTS = {
  deadline: { value: SETTINGS.deadline.default, version: 0 },
  reminders: { value: SETTINGS.reminders.default, version: 0 },
  'texts.annex1': { value: SETTINGS['texts.annex1'].default, version: 0 },
};

describe('settings.read', () => {
  it('gives the headmaster the code defaults, at version 0, when nothing is stored', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await read(head)).toEqual({ ok: true, value: DEFAULTS });
  });

  it('gives a stored value with its version and leaves the other keys at their defaults', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.setting('deadline', { dayOffset: -3, time: '18:15' });
    expect(await read(head)).toEqual({
      ok: true,
      value: { ...DEFAULTS, deadline: { value: { dayOffset: -3, time: '18:15' }, version: 1 } },
    });
  });

  it('gives the default deadline in the shape the code uses today: Saturday 20.00 for a Monday', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const got = await read(head);
    expect(got.ok && got.value.deadline.value).toEqual({ dayOffset: -2, time: '20:00' });
  });

  it('refuses everyone but the headmaster', async () => {
    for (const role of ['pending', 'submitter', 'reviewer'] as const) {
      const user = await world.seed.user({ role });
      expect(await read(user), role).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
    const gone = await world.seed.user({ role: 'headmaster', status: 'deactivated' });
    expect(await read(gone)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('refuses a key it does not know', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await read(head, { key: 'deadline' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('fails with a code that names the key and never holds the stored text', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.setting('reminders', { soft: 'Tajný text', hard: true });
    const failure = await read(head).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DatabaseFailure);
    expect((failure as DatabaseFailure).sqlstate).toBe('settings.invalid.reminders');
    expect(JSON.stringify(failure)).not.toContain('Tajný');
    expect((failure as Error).message).not.toContain('Tajný');
  });

  it('fails the same way for an empty object', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await world.seed.setting('deadline', {});
    const failure = await read(head).catch((error: unknown) => error);
    expect((failure as DatabaseFailure).sqlstate).toBe('settings.invalid.deadline');
  });

  it('cannot run for the system', async () => {
    await expect(world.run(readSettings, system('cli:test'), {})).rejects.toThrow(
      'settings.read: runs as a signed-in user',
    );
  });
});

describe('readSettingValue', () => {
  const value = <K extends 'deadline' | 'reminders'>(key: K) =>
    world.tx(system('job:test'), (tx) => readSettingValue(tx, key), 'read');

  it('gives the default of the registry when nothing is stored', async () => {
    expect(await value('deadline')).toEqual(SETTINGS.deadline.default);
  });

  it('gives a stored value, checked against its schema', async () => {
    await world.seed.setting('reminders', { soft: false, hard: true });
    expect(await value('reminders')).toEqual({ soft: false, hard: true });
  });

  it('fails like settings.read for a stored value that breaks its schema', async () => {
    await world.seed.setting('deadline', { dayOffset: 3, time: 'Tajný text' });
    const failure = await value('deadline').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DatabaseFailure);
    expect((failure as DatabaseFailure).sqlstate).toBe('settings.invalid.deadline');
    expect(JSON.stringify(failure)).not.toContain('Tajný');
  });
});
