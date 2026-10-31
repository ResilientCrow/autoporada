import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const CHECK = '23514';

// One database serves the whole file.
afterEach(() => database.owner('DELETE FROM settings'));

const insert = (key: string, value = '{}') =>
  database.db.execute(sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}::jsonb)`);
const update = (set: ReturnType<typeof sql>) =>
  database.db.execute(sql`UPDATE settings SET ${set} WHERE key = 'reminders'`);
const keys = async () =>
  (await database.owner<{ key: string }>(`SELECT key FROM settings`)).map((r) => r.key);

describe('the settings table', () => {
  it('stores a value at version 1 and the time of the insert', async () => {
    await insert('deadline', '{"dayOffset":-2,"time":"20:00"}');
    const [row] = await database.owner<{ version: number; value: unknown; age: number }>(
      `SELECT version, value, extract(epoch FROM now() - updated_at)::float AS age FROM settings`,
    );
    expect(row).toMatchObject({ version: 1, value: { dayOffset: -2, time: '20:00' } });
    expect(row?.age).toBeLessThan(60);
  });

  it.each(['deadline', 'texts.annex1', 'a', '0.1', 'x'.repeat(64)])(
    'accepts the key %s',
    async (key) => {
      await insert(key);
      expect(await keys()).toEqual([key]);
    },
  );

  it.each(['', 'Deadline', 'texts_annex1', 'a b', 'ž', 'x'.repeat(65), 'a-b'])(
    'refuses the key %j with settings_key',
    async (key) => {
      expect(await pgErrorOf(insert(key))).toMatchObject({
        code: CHECK,
        constraint: 'settings_key',
      });
    },
  );

  it('keeps a key once', async () => {
    await insert('deadline');
    expect(await pgErrorOf(insert('deadline'))).toMatchObject({
      code: '23505',
      constraint: 'settings_pkey',
    });
  });

  it('takes a value of 64 KiB and refuses one byte more with settings_size', async () => {
    // jsonb prints {"x": "…"}: nine bytes around the text, so 65527 characters make 65536 bytes.
    const sized = (n: number) => JSON.stringify({ x: 'x'.repeat(n) });
    await insert('texts.annex1', sized(65_527));
    expect(await pgErrorOf(insert('deadline', sized(65_528)))).toMatchObject({
      code: CHECK,
      constraint: 'settings_size',
    });
  });

  it.each(['"text"', '"123"', '123', 'true', '[]', '[{"soft":true}]', 'null'])(
    'refuses the value %s, which is not an object, with settings_value',
    async (value) => {
      expect(await pgErrorOf(insert('deadline', value))).toMatchObject({
        code: CHECK,
        constraint: 'settings_value',
      });
    },
  );

  it('refuses a missing value', async () => {
    const insertNull = database.db.execute(
      sql`INSERT INTO settings (key, value) VALUES ('deadline', NULL)`,
    );
    expect(await pgErrorOf(insertNull)).toMatchObject({ code: '23502' });
  });

  it('lets an update through only when it raises the version by one', async () => {
    await insert('reminders', '{"soft":true,"hard":true}');
    const bumpRefused = { code: CHECK, constraint: 'version_bump' };
    expect(await pgErrorOf(update(sql`value = '{"soft":false,"hard":true}'`))).toMatchObject(
      bumpRefused,
    );
    expect(await pgErrorOf(update(sql`version = version + 2`))).toMatchObject(bumpRefused);
    await update(sql`value = '{"soft":false,"hard":true}', version = version + 1`);
    const [row] = await database.owner<{ version: number }>(`SELECT version FROM settings`);
    expect(row?.version).toBe(2);
  });
});
