/**
 * Builds the template database every integration test file clones: the
 * migrations run once per change of drizzle/, not once per file.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { Client } from 'pg';

import { MIGRATIONS_DIR, runMigrations } from '@/infra/db';

import { adminUrl, databaseUrl, TEMPLATE } from '../support/database';

function migrationsHash(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  for (const file of walk(MIGRATIONS_DIR).sort()) {
    hash.update(relative(MIGRATIONS_DIR, file)).update('\0').update(readFileSync(file));
  }
  return `migrations:${hash.digest('hex')}`;
}

export default async function setup(): Promise<void> {
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    const wanted = migrationsHash();
    const { rows } = await admin.query<{ comment: string | null }>(
      'SELECT shobj_description(oid, $2) AS comment FROM pg_database WHERE datname = $1',
      [TEMPLATE, 'pg_database'],
    );
    if (rows[0]?.comment === wanted) return;

    await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEMPLATE}`);
    await runMigrations(databaseUrl(TEMPLATE));
    await admin.query(`COMMENT ON DATABASE ${TEMPLATE} IS '${wanted}'`);
  } finally {
    await admin.end();
  }
}
