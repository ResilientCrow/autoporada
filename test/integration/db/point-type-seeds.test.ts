import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseFailure, system, type Tx } from '@/application/ports';
import { defaultBulletsSchema } from '@/contracts';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const CHECK = '23514';

interface Row {
  name: string;
  title_gender: string | null;
  default_bullets: unknown;
  active: boolean;
  locked: boolean;
  position: number;
}

const seeded = () =>
  database.owner<Row>(
    `SELECT name, title_gender, default_bullets, active, locked, position
       FROM point_types ORDER BY position`,
  );

/** Inserts a type as the app; the defaults stand in for a valid row. */
const insert = ({
  name = 'Zkouška',
  bullets = '[]',
  locked = false,
  active = true,
}: { name?: string; bullets?: string; locked?: boolean; active?: boolean } = {}) =>
  database.db.execute(sql`
    INSERT INTO point_types (name, default_bullets, locked, active, position)
    VALUES (${name}, ${bullets}::jsonb, ${locked}, ${active}, 100)`);

describe('point type seeds (migration 0014)', () => {
  it('has six placeholder types in the order of the design, Jiné last', async () => {
    const rows = await seeded();
    expect(rows.map((r) => [r.name, r.title_gender])).toEqual([
      ['Seminář', 'm'],
      ['Exkurze', 'f'],
      ['Soutěž', 'f'],
      ['Přednáška', 'f'],
      ['Projektový den', 'm'],
      ['Jiné', null],
    ]);
    expect(rows.map((r) => r.position)).toEqual(
      [...rows.map((r) => r.position)].sort((a, b) => a - b),
    );
    expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
  });

  it('has bullets that parse with the contracts schema, with stable keys', async () => {
    for (const row of await seeded()) {
      const bullets = defaultBulletsSchema.parse(row.default_bullets);
      const keys = bullets.map((b) => b.key);
      expect(new Set(keys).size, row.name).toBe(keys.length);
      for (const key of keys) expect(key, row.name).toMatch(/^[a-z]+$/);
      expect(bullets.filter((b) => b.role === 'organisers').length, row.name).toBeLessThanOrEqual(
        1,
      );
      expect(
        bullets.some((b) => b.kind === 'people'),
        row.name,
      ).toBe(true);
    }
  });

  it('reads back through the repository as the same six types', async () => {
    // This describe runs first, so only the migration's rows are there.
    const types = await database.app.transaction(
      { principal: system('cli:test'), now: new Date(), requestId: 'req-1' },
      { mode: 'read' },
      (tx: Tx) => tx.pointTypes.list(),
    );
    expect(types.map((t) => [t.name, t.titleGender, t.locked])).toEqual(
      (await seeded()).map((r) => [r.name, r.title_gender, r.locked]),
    );
  });

  it('has exactly one locked type, Jiné, and it is active', async () => {
    const locked = (await seeded()).filter((r) => r.locked);
    expect(locked.map((r) => [r.name, r.active])).toEqual([['Jiné', true]]);
    expect((await seeded()).every((r) => r.active)).toBe(true);
  });
});

describe('point type guards (migrations 0013 and 0014)', () => {
  it('refuses a second type with the same name by its unique key', async () => {
    expect(await pgErrorOf(insert({ name: 'Seminář' }))).toMatchObject({
      code: '23505',
      constraint: 'point_types_name_key',
    });
  });

  it('refuses a locked type that is not active, on insert and on update', async () => {
    expect(await pgErrorOf(insert({ locked: true, active: false }))).toMatchObject({
      code: CHECK,
      constraint: 'point_types_locked_active',
    });
    const off = sql`UPDATE point_types SET active = false, version = version + 1 WHERE name = 'Jiné'`;
    expect(await pgErrorOf(database.db.execute(off))).toMatchObject({
      code: CHECK,
      constraint: 'point_types_locked_active',
    });
  });

  it('refuses default bullets that are not an array or hold more than twelve', async () => {
    const many = (n: number) =>
      JSON.stringify(Array.from({ length: n }, (_, i) => ({ key: `b${i}` })));
    for (const bullets of ['{}', 'null', '"x"', many(13)]) {
      expect(await pgErrorOf(insert({ bullets })), bullets.slice(0, 20)).toMatchObject({
        code: CHECK,
        constraint: 'point_types_bullets_array',
      });
    }
    await insert({ bullets: many(12) });
  });

  it('lets a version rise by exactly one, for the app and the owner alike', async () => {
    const statusOnly = `UPDATE point_types SET active = false WHERE name = 'Soutěž'`;
    expect(await pgErrorOf(database.db.execute(sql.raw(statusOnly)))).toMatchObject({
      code: CHECK,
      constraint: 'version_bump',
    });
    await expect(database.owner(statusOnly)).rejects.toMatchObject({
      code: CHECK,
      constraint: 'version_bump',
    });
    await database.db.execute(
      sql`UPDATE point_types SET active = false, version = version + 1 WHERE name = 'Soutěž'`,
    );
    const [row] = await database.owner<{ active: boolean; version: number }>(
      `SELECT active, version FROM point_types WHERE name = 'Soutěž'`,
    );
    expect(row).toEqual({ active: false, version: 2 });
  });
});

describe('a stored row the contract refuses', () => {
  const SECRET = 'jana.novakova@ssps.cz';
  // The database is not reset between tests: take the bad row away again.
  afterEach(async () => {
    await database.owner(`DELETE FROM point_types WHERE position = 0`);
  });

  const read = <T>(run: (tx: Tx) => Promise<T>) =>
    database.app
      .transaction(
        { principal: system('cli:test'), now: new Date(), requestId: 'req-1' },
        { mode: 'read' },
        run,
      )
      .catch((error: unknown) => error);

  /** Position 0 sorts before every other row of this file, so list() reads the bad row first. */
  const storeBadRow = async () => {
    const [row] = await database.owner<{ id: string }>(
      `INSERT INTO point_types (name, default_bullets, position)
       VALUES ('Tajný název', '[{"key":"${SECRET}"}]', 0) RETURNING id`,
    );
    return row?.id ?? '';
  };

  const expectCodeOnly = (failure: unknown) => {
    expect(failure).toBeInstanceOf(DatabaseFailure);
    expect((failure as DatabaseFailure).sqlstate).toBe('db.parse.point_types');
    expect(Object.keys(failure as object).sort()).toEqual(['name', 'sqlstate']);
    expect((failure as Error).cause).toBeUndefined();
    for (const text of [JSON.stringify(failure), String((failure as Error).message)]) {
      expect(text).not.toContain('novakova');
      expect(text).not.toContain('Tajný');
    }
  };

  it('fails list() with a code that never holds the stored text', async () => {
    await storeBadRow();
    expectCodeOnly(await read((tx) => tx.pointTypes.list()));
  });

  it('fails get() the same way', async () => {
    const id = await storeBadRow();
    expectCodeOnly(await read((tx) => tx.pointTypes.get(id)));
  });
});
