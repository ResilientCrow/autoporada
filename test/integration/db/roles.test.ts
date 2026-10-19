import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { setupTestDatabase } from '../../support/database';

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
