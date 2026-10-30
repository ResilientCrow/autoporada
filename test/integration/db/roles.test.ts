import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
/** SQLSTATE insufficient_privilege, from the pg error Drizzle wraps. */
const DENIED = { cause: { code: '42501' } };

describe('database roles (ADR 0010)', () => {
  it('lets the app role use the schema, never change it', async () => {
    const rows = await database.owner(
      `SELECT has_schema_privilege('autoporada_app', 'public', 'USAGE') AS usage,
              has_schema_privilege('autoporada_app', 'public', 'CREATE') AS "create"`,
    );
    expect(rows).toEqual([{ usage: true, create: false }]);
    await expect(database.db.execute(sql`CREATE TABLE intruder (id int)`)).rejects.toMatchObject(
      DENIED,
    );
  });

  it('keeps the migration history away from the app', async () => {
    await expect(
      database.db.execute(sql`SELECT count(*) FROM drizzle.__drizzle_migrations`),
    ).rejects.toMatchObject(DENIED);
  });

  it('gives the app no temporary tables', async () => {
    expect(
      await pgErrorOf(database.db.execute(sql`CREATE TEMP TABLE users (role text)`)),
    ).toMatchObject({
      code: '42501',
    });
  });

  it('pins the search path of every trigger function', async () => {
    const functions = await database.owner<{ name: string; config: string[] | null }>(
      `SELECT proname AS name, proconfig AS config FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace AND prorettype = 'trigger'::regtype
        ORDER BY 1`,
    );
    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      expect(fn.config, fn.name).toContain('search_path=pg_catalog, public, pg_temp');
    }
  });

  it('checks public.users for the last headmaster, whatever a session put in pg_temp', async () => {
    await database.truncate('users');
    const [head] = await database.owner<{ id: string }>(
      `INSERT INTO users (tid, oid, display_name, role)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ředitel', 'headmaster') RETURNING id`,
    );
    const shadowed = database.owner(
      `BEGIN;
       CREATE TEMP TABLE users (role text, status text);
       INSERT INTO users VALUES ('headmaster', 'active');
       UPDATE public.users SET role = 'reviewer' WHERE id = '${head!.id}';
       COMMIT;`,
    );
    expect(await pgErrorOf(shadowed)).toMatchObject({
      code: '23514',
      constraint: 'users_active_headmaster',
    });
  });

  it('grants every table exactly the default privileges, unless listed here', async () => {
    // The audit log and the point and future events are append-only: no UPDATE (migrations
    // 0004, 0016, 0020), and the app never deletes an event (their item's cascade runs as the
    // owner). Only the worker writes delivery state, so the mail tables have no app
    // grant at all (0009, ADR 0016); the backup keeps its read on them, since backups
    // include the ledger.
    const EXCEPTIONS: Record<string, string | null> = {
      audit_events: 'DELETE,INSERT,SELECT',
      mail_gate: null,
      mail_ledger: null,
      point_events: 'INSERT,SELECT',
      future_events: 'INSERT,SELECT',
    };
    const grants = await database.owner<{ table: string; grantee: string; privileges: string }>(
      `SELECT c.relname AS table, g.grantee,
              coalesce(string_agg(g.privilege_type, ',' ORDER BY g.privilege_type), '') AS privileges
         FROM pg_class c
         JOIN information_schema.role_table_grants g
           ON g.table_schema = 'public' AND g.table_name = c.relname
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
          AND g.grantee IN ('autoporada_app', 'autoporada_backup')
        GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    const tables = (
      await database.owner<{ name: string }>(
        `SELECT relname AS name FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') ORDER BY 1`,
      )
    ).map((t) => t.name);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toEqual(expect.arrayContaining(Object.keys(EXCEPTIONS)));
    expect(grants).toEqual(
      tables.flatMap((table) => {
        const listed = EXCEPTIONS[table];
        const app = listed === undefined ? 'DELETE,INSERT,SELECT,UPDATE' : listed;
        return [
          ...(app === null ? [] : [{ table, grantee: 'autoporada_app', privileges: app }]),
          { table, grantee: 'autoporada_backup', privileges: 'SELECT' },
        ];
      }),
    );
  });

  it('grants every new table to the app (DML) and the backup (read)', async () => {
    await database.owner('CREATE TABLE probe (id int PRIMARY KEY, note text)');
    try {
      await database.db.execute(sql`INSERT INTO probe VALUES (1, 'a')`);
      await database.db.execute(sql`UPDATE probe SET note = 'b' WHERE id = 1`);
      await database.db.execute(sql`DELETE FROM probe WHERE id = 1`);
      const grants = await database.owner(
        `SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
           FROM information_schema.role_table_grants
          WHERE table_name = 'probe' AND grantee LIKE 'autoporada\\_%'
          GROUP BY grantee ORDER BY grantee`,
      );
      expect(grants).toEqual([
        { grantee: 'autoporada_app', privileges: 'DELETE,INSERT,SELECT,UPDATE' },
        { grantee: 'autoporada_backup', privileges: 'SELECT' },
      ]);
    } finally {
      await database.owner('DROP TABLE probe');
    }
  });
});
