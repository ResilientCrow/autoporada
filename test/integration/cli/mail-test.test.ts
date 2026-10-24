import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { system, type Db } from '@/application/ports';
import { mailTest } from '@/cli/mail';
import { databaseOn, openPool, type DatabasePool } from '@/infra/db';
import { createProducer } from '@/infra/jobs';
import { createLogger } from '@/infra/log';

import { setupTestDatabase } from '../../support/database';
import { databaseUrl } from '../../support/template-db';

/** The way main.ts runs it: the owner's pool, and a producer on the owner's connection. */
const database = setupTestDatabase();
const NOW = new Date('2026-10-24T08:00:00Z');
let pool: DatabasePool;
let producer: ReturnType<typeof createProducer>;
let owner: Db;

beforeAll(async () => {
  const url = databaseUrl(database.name);
  pool = openPool({ url, applicationName: 'autoporada-test-cli', maxConnections: 2 });
  producer = createProducer({
    url,
    applicationName: 'autoporada-test-cli',
    log: createLogger({ service: 'test', level: 'error' }),
  });
  await producer.start();
  owner = databaseOn(pool, { jobsOn: producer.jobsOn }).app;
});
afterAll(async () => {
  await producer.stop();
  await pool.end();
});

async function reviewer(): Promise<string> {
  const ctx = { principal: system('test.seed'), now: NOW, requestId: 'seed' };
  return database.app.transaction(ctx, { mode: 'write' }, async (tx) => {
    const created = await tx.users.upsertFromClaims({
      tid: '00000000-0000-0000-0000-000000000001',
      oid: crypto.randomUUID(),
      displayName: 'Jana Nováková',
      email: 'jana@ssps.cz',
      jobTitle: null,
      department: null,
    });
    return (await tx.users.changeAccess(created.id, created.version, { role: 'reviewer' })).id;
  });
}

const auditFor = (key: string) =>
  database.owner<{ action: string; target_id: string; data: unknown }>(
    `SELECT action, target_id, data FROM audit_events
      WHERE action = 'cli.mail-test' AND data -> 'meta' ->> 'dedupeKey' = $1`,
    [key],
  );
const jobsFor = (key: string) =>
  database.owner<{ name: string; data: unknown }>(
    `SELECT name, data FROM pgboss.job WHERE name = 'mail.send' AND singleton_key = $1`,
    [key],
  );

describe('mail:test over PostgreSQL, as the owner', () => {
  it('lands the audit row and the job in one transaction', async () => {
    const userId = await reviewer();
    const checkId = crypto.randomUUID();
    const key = `mail.check:${checkId}`;

    await mailTest({ db: owner, clock: { now: () => NOW }, newId: () => checkId }, [
      '--user',
      userId,
    ]);

    expect(await auditFor(key)).toEqual([
      {
        action: 'cli.mail-test',
        target_id: userId,
        data: { meta: { dedupeKey: key }, system: 'cli:mail-test' },
      },
    ]);
    expect(await jobsFor(key)).toEqual([
      {
        name: 'mail.send',
        data: { template: 'mail.check', recipientId: userId, subjectId: userId },
      },
    ]);
  });

  it('leaves neither when the transaction rolls back after both were written', async () => {
    const userId = await reviewer();
    const checkId = crypto.randomUUID();
    const key = `mail.check:${checkId}`;
    const failing: Db = {
      transaction: (ctx, options, work) =>
        owner.transaction(ctx, options, async (tx) => {
          const result = await work(tx);
          // both writes are in the transaction by now
          throw new Error('rolled back on purpose');
          return result;
        }),
    };

    await expect(
      mailTest({ db: failing, clock: { now: () => NOW }, newId: () => checkId }, [
        '--user',
        userId,
      ]),
    ).rejects.toThrow('rolled back on purpose');

    expect(await auditFor(key)).toEqual([]);
    expect(await jobsFor(key)).toEqual([]);
  });
});
