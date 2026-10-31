import { describe, expect, it } from 'vitest';

import { system, type Tx } from '@/application/ports';

import { erasureRefusedBy, setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

const read = <T>(work: (tx: Tx) => Promise<T>) => world.tx(cli, work, 'read');

describe('SettingsRepo (port contract)', () => {
  it('has nothing stored to begin with', async () => {
    expect(await read((tx) => tx.settings.get('deadline'))).toBeNull();
  });

  it('returns the stored value as it was written, at version 1', async () => {
    const value = { dayOffset: -3, time: '18:30' };
    await world.seed.setting('deadline', value);
    expect(await read((tx) => tx.settings.get('deadline'))).toEqual({ value, version: 1 });
  });

  it('keeps nested values, arrays, nulls and Czech text intact', async () => {
    const value = { list: [1, null, { ž: 'řeřicha' }], flag: false, text: 'Příloha č. 1' };
    await world.seed.setting('texts.annex1', value);
    expect(await read((tx) => tx.settings.get('texts.annex1'))).toEqual({ value, version: 1 });
  });

  it('keeps every key apart and answers null for the others', async () => {
    await world.seed.setting('reminders', { soft: false, hard: true });
    await world.seed.setting('deadline', { dayOffset: -1, time: '12:00' });
    expect(await read((tx) => tx.settings.get('reminders'))).toEqual({
      value: { soft: false, hard: true },
      version: 1,
    });
    expect(await read((tx) => tx.settings.get('texts.annex1'))).toBeNull();
  });

  it('refuses a value that is not an object, as the table does', async () => {
    for (const value of ['garbage', '123', 123, null, [{ soft: true }], true]) {
      await expect(world.seed.setting('deadline', value), String(value)).rejects.toMatchObject(
        erasureRefusedBy(world.kind, 'settings_value'),
      );
    }
    expect(await read((tx) => tx.settings.get('deadline'))).toBeNull();
  });

  it('can be read in a read transaction by the system and by every signed-in role', async () => {
    await world.seed.setting('reminders', { soft: true, hard: true });
    const expected = { value: { soft: true, hard: true }, version: 1 };
    expect(
      await world.tx(system('job:test'), (tx) => tx.settings.get('reminders'), 'read'),
    ).toEqual(expected);
    for (const role of ['pending', 'submitter', 'reviewer', 'headmaster'] as const) {
      const user = await world.seed.user({ role });
      const got = await world.tx(world.as(user), (tx) => tx.settings.get('reminders'), 'read');
      expect(got, role).toEqual(expected);
    }
  });

  describe('value (key and value only, what the worker may select)', () => {
    it('is null when nothing is stored', async () => {
      expect(await read((tx) => tx.settings.value('deadline'))).toBeNull();
    });

    it('returns the stored value as it was written, without the version', async () => {
      const value = { list: [1, null, { ž: 'řeřicha' }], flag: false };
      await world.seed.setting('texts.annex1', value);
      expect(await read((tx) => tx.settings.value('texts.annex1'))).toEqual(value);
      expect(await read((tx) => tx.settings.value('reminders'))).toBeNull();
    });

    it('can be read in a read transaction by the system', async () => {
      await world.seed.setting('reminders', { soft: true, hard: false });
      expect(
        await world.tx(system('job:test'), (tx) => tx.settings.value('reminders'), 'read'),
      ).toEqual({ soft: true, hard: false });
    });
  });
});
