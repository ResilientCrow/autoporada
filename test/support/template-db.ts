/**
 * The migrated template database and the clones made from it. Free of vitest,
 * so the integration and the e2e global setups share it.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

import { Client } from 'pg';

import { MIGRATIONS_DIR, runMigrations } from '@/infra/migrate';

const TEMPLATE = 'autoporada_test_template';

/** The cluster owner's connection, as in .env.example and CI. */
export const adminUrl = () =>
  process.env['DATABASE_URL'] ?? 'postgres://autoporada:autoporada@localhost:5432/autoporada';

export function databaseUrl(name: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/** What `migrate` installs besides drizzle/: pg-boss's schema, and the code that sets up its queues. */
const JOB_INSTALL_FILES = [
  'src/infra/jobs/install.ts',
  'src/infra/jobs/queues.ts',
  'src/infra/jobs/grants.ts',
];

function migrationsHash(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  for (const file of walk(MIGRATIONS_DIR).sort()) {
    hash.update(relative(MIGRATIONS_DIR, file)).update('\0').update(readFileSync(file));
  }
  const pgBoss = JSON.parse(
    readFileSync(createRequire(import.meta.url).resolve('pg-boss/package.json'), 'utf8'),
  ) as { version: string; pgboss: { schema: number } };
  hash.update(`pg-boss ${pgBoss.version} schema ${pgBoss.pgboss.schema}`);
  for (const file of JOB_INSTALL_FILES) hash.update(file).update('\0').update(readFileSync(file));
  return `migrations:${hash.digest('hex')}`;
}

async function asAdmin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Builds the template once per change of drizzle/, not once per test file or run. */
export async function ensureTemplate(): Promise<void> {
  await asAdmin(async (admin) => {
    const wanted = migrationsHash();
    const { rows } = await admin.query<{ comment: string | null }>(
      'SELECT shobj_description(oid, $2) AS comment FROM pg_database WHERE datname = $1',
      [TEMPLATE, 'pg_database'],
    );
    if (rows[0]?.comment !== wanted) {
      await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${TEMPLATE}`);
      await runMigrations(databaseUrl(TEMPLATE));
      await admin.query(`COMMENT ON DATABASE ${TEMPLATE} IS '${wanted}'`);
    }
    // Production makes this login role in initdb; roles are cluster-wide, so it outlives the template.
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_worker') THEN
        CREATE ROLE autoporada_worker NOLOGIN IN ROLE autoporada_jobs;
      END IF;
    END $$`);
  });
}

/** A fresh clone of the template under `name`; an existing database of that name is dropped. */
export async function recreateFromTemplate(name: string): Promise<void> {
  await asAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE}`);
    // A clone gets the default database privileges back; repeat what migration 0005 revoked.
    await admin.query(`REVOKE TEMPORARY ON DATABASE ${name} FROM PUBLIC`);
  });
}
