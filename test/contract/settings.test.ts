import { describe, expect, it } from 'vitest';

import { DatabaseFailure, ScopeViolation, system, type Tx } from '@/application/ports';

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

  describe('save (first save at version 0, then the version read)', () => {
    /** An unregistered constraint, as ADR 0022 reports it, in both worlds. */
    const refusedBy = (constraint: string) => ({ sqlstate: `db.constraint.${constraint}` });
    const save = (key: string, value: unknown, expected: number) =>
      world.tx(cli, (tx) => tx.settings.save(key, value, expected));

    it('stores a first value at version 1 and gives the version', async () => {
      const value = { soft: false, hard: true };
      expect(await save('reminders', value, 0)).toBe(1);
      expect(await read((tx) => tx.settings.get('reminders'))).toEqual({ value, version: 1 });
    });

    it('replaces the value at the named version and gives the next one', async () => {
      await save('reminders', { soft: true, hard: true }, 0);
      expect(await save('reminders', { soft: false, hard: false }, 1)).toBe(2);
      expect(await save('reminders', { soft: true, hard: false }, 2)).toBe(3);
      expect(await read((tx) => tx.settings.get('reminders'))).toEqual({
        value: { soft: true, hard: false },
        version: 3,
      });
    });

    it('gives null for a stale version and changes nothing', async () => {
      await save('reminders', { soft: true, hard: true }, 0);
      await save('reminders', { soft: false, hard: true }, 1);
      expect(await save('reminders', { soft: false, hard: false }, 1)).toBeNull();
      expect(await save('reminders', { soft: false, hard: false }, 3)).toBeNull();
      expect(await read((tx) => tx.settings.get('reminders'))).toEqual({
        value: { soft: false, hard: true },
        version: 2,
      });
    });

    it('gives null for a first save over a row that exists, and for a version of a row that does not', async () => {
      await world.seed.setting('reminders', { soft: true, hard: true });
      expect(await save('reminders', { soft: false, hard: false }, 0)).toBeNull();
      expect(await save('deadline', { dayOffset: -3, time: '18:00' }, 1)).toBeNull();
      expect(await read((tx) => tx.settings.get('reminders'))).toEqual({
        value: { soft: true, hard: true },
        version: 1,
      });
      expect(await read((tx) => tx.settings.get('deadline'))).toBeNull();
    });

    it('keeps every key apart', async () => {
      await save('reminders', { soft: false, hard: true }, 0);
      expect(await save('deadline', { dayOffset: -3, time: '18:00' }, 0)).toBe(1);
      expect(await read((tx) => tx.settings.value('reminders'))).toEqual({
        soft: false,
        hard: true,
      });
    });

    it('refuses a key the table does not allow, with settings_key', async () => {
      await expect(save('Bad Key', {}, 0)).rejects.toMatchObject(refusedBy('settings_key'));
    });

    it('takes a value of 64 KiB as the database prints it and refuses one byte more, with settings_size', async () => {
      // jsonb prints {"x": "…"}: nine bytes around the text, so 65527 characters make 65536 bytes.
      const sized = (n: number) => ({ x: 'x'.repeat(n) });
      expect(await save('texts.annex1', sized(65_527), 0)).toBe(1);
      await expect(save('deadline', sized(65_528), 0)).rejects.toMatchObject(
        refusedBy('settings_size'),
      );
      await expect(save('texts.annex1', sized(65_528), 1)).rejects.toMatchObject(
        refusedBy('settings_size'),
      );
    });

    it('ignores a member with no JSON form, as the database never sees it', async () => {
      // JSON drops `gone`, so the printed value is exactly 65536 bytes.
      expect(await save('texts.annex1', { gone: undefined, x: 'x'.repeat(65_527) }, 0)).toBe(1);
    });

    it('names settings_size before settings_value for a text over 64 KiB, as the database checks in name order', async () => {
      await expect(save('deadline', 'x'.repeat(70_000), 0)).rejects.toMatchObject(
        refusedBy('settings_size'),
      );
    });

    it('refuses a value that is not an object, with settings_value', async () => {
      for (const value of ['text', 5, true, [{ soft: true }]]) {
        await expect(save('deadline', value, 0), String(value)).rejects.toMatchObject(
          refusedBy('settings_value'),
        );
      }
    });

    it('lets only someone who may manage the settings write them', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const value = { soft: true, hard: true };
      await expect(
        world.tx(world.as(reviewer), (tx) => tx.settings.save('reminders', value, 0)),
      ).rejects.toBeInstanceOf(ScopeViolation);
      expect(await world.tx(world.as(head), (tx) => tx.settings.save('reminders', value, 0))).toBe(
        1,
      );
      await expect(
        world.tx(world.as(reviewer), (tx) => tx.settings.save('reminders', value, 1)),
      ).rejects.toBeInstanceOf(ScopeViolation);
    });

    it('writes nothing in a read transaction', async () => {
      await expect(
        read((tx) => tx.settings.save('reminders', { soft: true, hard: true }, 0)),
      ).rejects.toBeInstanceOf(DatabaseFailure);
    });
  });
});
