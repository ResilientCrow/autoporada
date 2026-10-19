import type { Pool } from 'pg';

import type { Db, TxOptions } from '@/application/ports';

import { fromDriver, isRetryable, toPortError } from './pg-errors';
import { buildTx } from './tx';

const ATTEMPTS = 3;
const DEFAULT_TIMEOUTS = { statementTimeoutMs: 5_000, lockTimeoutMs: 3_000, idleTimeoutMs: 15_000 };

async function driver<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw fromDriver(error);
  }
}

function beginStatement(options: TxOptions): string {
  const t = { ...DEFAULT_TIMEOUTS, ...options };
  for (const ms of [t.statementTimeoutMs, t.lockTimeoutMs, t.idleTimeoutMs]) {
    if (!Number.isSafeInteger(ms) || ms <= 0) throw new RangeError('timeouts are positive ms');
  }
  return [
    options.mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN',
    `SET LOCAL statement_timeout = ${t.statementTimeoutMs}`,
    `SET LOCAL lock_timeout = ${t.lockTimeoutMs}`,
    `SET LOCAL idle_in_transaction_session_timeout = ${t.idleTimeoutMs}`,
  ].join('; ');
}

/** Transactions on the app's connection pool (ADR 0011). */
export function createPgDb(pool: Pool): Db {
  return {
    async transaction(ctx, options, work) {
      const begin = beginStatement(options);
      for (let attempt = 1; ; attempt++) {
        const client = await driver(() => pool.connect());
        const life = { open: true };
        let healthy = true;
        try {
          await driver(() => client.query(begin));
          const value = await work(buildTx(client, ctx, life));
          // Deferred constraint triggers run here.
          await driver(() => client.query('COMMIT'));
          return value;
        } catch (error) {
          healthy = await client.query('ROLLBACK').then(
            () => true,
            () => false,
          );
          if (attempt < ATTEMPTS && isRetryable(error)) continue;
          throw toPortError(error);
        } finally {
          life.open = false;
          // A connection whose ROLLBACK failed is destroyed, not reused.
          client.release(!healthy);
        }
      }
    },
  };
}
