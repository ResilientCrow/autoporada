import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, runMigrations } from '@/infra/migrate';

import { adminUrl, databaseUrl } from '../../support/database';

const name = `autoporada_test_migrate_${randomBytes(4).toString('hex')}`;
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8')) as {
  entries: unknown[];
};

async function admin(query: string, database?: string): Promise<unknown[]> {
  const client = new Client({ connectionString: database ? databaseUrl(database) : adminUrl() });
  await client.connect();
  try {
    return (await client.query(query)).rows;
  } finally {
    await client.end();
  }
}

describe('runMigrations', () => {
  beforeAll(() => admin(`CREATE DATABASE ${name}`));
  afterAll(() => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));

  it('applies every migration once, even with two migrators at the same time', async () => {
    await Promise.all([runMigrations(databaseUrl(name)), runMigrations(databaseUrl(name))]);
    await runMigrations(databaseUrl(name));
    const applied = await admin(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
      name,
    );
    expect(applied).toEqual([{ n: journal.entries.length }]);
  });
});
