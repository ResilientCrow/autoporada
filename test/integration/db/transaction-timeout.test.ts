import { describe, expect, it } from 'vitest';

import { DatabaseFailure, system, type Tx, type TxOptions } from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const ctx = () => ({ principal: system('job:test'), now: new Date(), requestId: 'tx-timeout' });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads, waits `ms` inside the transaction, reads again: three statements, each one quick. */
const slowWork = (ms: number) => async (tx: Tx) => {
  await tx.users.list();
  await pause(ms);
  return tx.users.list();
};

const run = (options: Omit<TxOptions, 'mode'>, ms: number) =>
  database.app.transaction(ctx(), { mode: 'write', ...options }, slowWork(ms));

describe('a bound on the whole transaction (transaction_timeout)', () => {
  it('ends a transaction that outlives it, though every statement was quick', async () => {
    await expect(run({ transactionTimeoutMs: 300 }, 800)).rejects.toBeInstanceOf(DatabaseFailure);
  });

  it('leaves a transaction alone that ends in time, and the pool keeps working', async () => {
    await run({ transactionTimeoutMs: 300 }, 800).catch(() => undefined);
    await expect(run({ transactionTimeoutMs: 5_000 }, 50)).resolves.toEqual([]);
  });

  it('bounds nothing unless asked', async () => {
    await expect(run({}, 800)).resolves.toEqual([]);
  });

  it('refuses a bound that is not a positive whole number of milliseconds', async () => {
    for (const transactionTimeoutMs of [0, -1, 1.5, Number.NaN]) {
      await expect(run({ transactionTimeoutMs }, 0)).rejects.toBeInstanceOf(RangeError);
    }
  });
});
