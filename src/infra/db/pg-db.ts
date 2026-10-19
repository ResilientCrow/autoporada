import type { Pool } from 'pg';

import { DatabaseFailure, type Db, type TxOptions } from '@/application/ports';

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
  const t = {
    statementTimeoutMs: options.statementTimeoutMs ?? DEFAULT_TIMEOUTS.statementTimeoutMs,
    lockTimeoutMs: options.lockTimeoutMs ?? DEFAULT_TIMEOUTS.lockTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_TIMEOUTS.idleTimeoutMs,
  };
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
        // The server can drop a checked-out connection (idle timeout, restart);
        // without a listener its 'error' event would crash the process.
        const lost = () => {
          healthy = false;
        };
        client.on('error', lost);
        try {
          await driver(() => client.query(begin));
          // Nothing the work started may run once it has settled: a query sent
          // later would land after COMMIT or ROLLBACK, outside the transaction.
          const value = await work(buildTx(client, ctx, life)).finally(() => {
            life.open = false;
          });
          // Deferred constraint triggers run here.
          const done = await driver(() => client.query('COMMIT'));
          // An aborted transaction (a failed query the work caught) answers
          // COMMIT with ROLLBACK and no error.
          if (done.command !== 'COMMIT') throw new DatabaseFailure('25P02');
          return value;
        } catch (error) {
          life.open = false;
          const rolledBack = await client.query('ROLLBACK').then(
            () => true,
            () => false,
          );
          healthy = healthy && rolledBack;
          if (attempt < ATTEMPTS && isRetryable(error)) continue;
          throw toPortError(error);
        } finally {
          client.off('error', lost);
          // A connection that failed or whose ROLLBACK failed is destroyed, not reused.
          client.release(!healthy);
        }
      }
    },
  };
}
