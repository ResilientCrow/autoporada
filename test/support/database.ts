/**
 * Integration tests get a database of their own per test file, cloned from
 * the migrated template (test/support/template-db.ts). The app's
 * connection runs as autoporada_app, so every test also checks the grants.
 */
import { randomBytes } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll } from 'vitest';

import type { Db } from '@/application/ports';
import { connectDatabase, type Database, type DatabaseHandle } from '@/infra/db';
import { createProducer } from '@/infra/jobs';
import { createLogger } from '@/infra/log';

import { adminUrl, databaseUrl, recreateFromTemplate } from './template-db';

const APP_ROLE = 'autoporada_app';
const WORKER_ROLE = 'autoporada_worker';

async function asAdmin<T>(run: (client: Client) => Promise<T>, database?: string): Promise<T> {
  const client = new Client({ connectionString: database ? databaseUrl(database) : adminUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  /** Drizzle over the app's connection pool, running as autoporada_app. */
  readonly db: Database;
  /** The application's transactions over the same pool (ADR 0011). */
  readonly app: Db;
  /**
   * The worker's transactions, running as autoporada_worker: the mail ledger
   * is its alone, while users and requests are seeded through `app`.
   */
  readonly worker: Db;
  readonly name: string;
  /** Runs SQL as the owner, for setup and for assertions on the catalog. */
  owner<R extends object>(sql: string, params?: unknown[]): Promise<R[]>;
  /** A connection of its own as autoporada_app, for tests of concurrent transactions. */
  connect(): Promise<Client>;
}

/** The PostgreSQL error behind a rejected query; Drizzle wraps it as `cause`. */
export async function pgErrorOf(
  query: Promise<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await query;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as { code?: string };
  }
  throw new Error('expected the query to fail');
}

/** A fresh database for this test file, dropped after its last test. */
export function setupTestDatabase(): TestDatabase {
  const name = `autoporada_test_${process.env['VITEST_POOL_ID'] ?? '0'}_${randomBytes(4).toString('hex')}`;
  let handle: DatabaseHandle | undefined;
  let workerHandle: DatabaseHandle | undefined;
  let producer: ReturnType<typeof createProducer> | undefined;
  const opened = () => {
    if (!handle) throw new Error('setupTestDatabase: the database exists only inside tests');
    return handle;
  };

  beforeAll(async () => {
    await recreateFromTemplate(name);
    // The jobs a test enqueues go through the producer the web uses, with the app role's grants.
    producer = createProducer({
      url: databaseUrl(name),
      applicationName: 'autoporada-test-producer',
      role: APP_ROLE,
      log: createLogger({ service: 'test', level: 'error' }),
    });
    await producer.start();
    handle = connectDatabase({
      jobsOn: producer.jobsOn,
      url: databaseUrl(name),
      applicationName: 'autoporada-test',
      role: APP_ROLE,
      maxConnections: 4,
    });
    // A pool connects on its first query, so files that never use the worker pay nothing.
    workerHandle = connectDatabase({
      jobsOn: producer.jobsOn,
      url: databaseUrl(name),
      applicationName: 'autoporada-test-worker',
      role: WORKER_ROLE,
      maxConnections: 4,
    });
  });
  afterAll(async () => {
    await producer?.stop();
    await handle?.close();
    await workerHandle?.close();
    await asAdmin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
  });

  return {
    name,
    get db() {
      return opened().db;
    },
    get app() {
      return opened().app;
    },
    get worker() {
      if (!workerHandle)
        throw new Error('setupTestDatabase: the database exists only inside tests');
      return workerHandle.app;
    },
    owner: (sql, params) => asAdmin(async (c) => (await c.query(sql, params)).rows, name),
    async connect() {
      const client = new Client({
        connectionString: databaseUrl(name),
        options: `-c role=${APP_ROLE}`,
      });
      await client.connect();
      return client;
    },
  };
}
