import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Db } from '@/application/ports';

import { createPgDb } from './pg-db';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseOptions {
  readonly url: string;
  /** Shown in pg_stat_activity: autoporada-web, autoporada-worker … */
  readonly applicationName: string;
  readonly maxConnections?: number;
  /**
   * Runs every connection as this role. Integration tests connect as the
   * cluster owner and use it to get exactly the app role's privileges.
   */
  readonly role?: string;
}

export interface DatabaseHandle {
  /** The whole schema, for maintenance commands and tests. */
  readonly db: Database;
  /** The application's transactions (ADR 0011). */
  readonly app: Db;
  /** Waits for checked-out connections to be released, then closes the pool. */
  close(): Promise<void>;
}

const ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

export function connectDatabase(options: DatabaseOptions): DatabaseHandle {
  if (options.role !== undefined && !ROLE_NAME.test(options.role)) {
    throw new Error('connectDatabase: role must be a plain lower-case identifier');
  }
  const pool = new Pool({
    connectionString: options.url,
    application_name: options.applicationName,
    max: options.maxConnections ?? 10,
    // A startup parameter, so the role is set before the first query runs.
    ...(options.role && { options: `-c role=${options.role}` }),
  });
  return {
    db: drizzle({ client: pool, schema, casing: 'snake_case' }),
    app: createPgDb(pool),
    close: () => pool.end(),
  };
}
