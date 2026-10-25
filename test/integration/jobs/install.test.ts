import { randomBytes } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '@/infra/log';
import { PGBOSS_SCHEMA_VERSION, QUEUES, createBoss, installJobs } from '@/infra/jobs';

import { databaseUrl } from '../../support/template-db';

const SLOW = 60_000;
const name = `autoporada_test_jobs_${randomBytes(4).toString('hex')}`;
const url = databaseUrl(name);
const log = createLogger({ service: 'test', level: 'error' });
const packageSchema = PGBOSS_SCHEMA_VERSION;

async function sql<T extends object>(text: string, database: string = name): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl(database) });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

/** Reads the queues back through pg-boss as the owner, without starting any background work. */
async function readQueues() {
  const boss = createBoss('producer', { url, applicationName: 'autoporada-test', log });
  await boss.start();
  try {
    return await boss.getQueues();
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}

describe('installJobs', () => {
  beforeAll(() => sql(`CREATE DATABASE ${name}`, 'postgres'));
  afterAll(() => sql(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`, 'postgres'));
  // Every test starts on a database pg-boss has never touched, and installs what it needs.
  beforeEach(() => sql('DROP SCHEMA IF EXISTS pgboss CASCADE'));

  it(
    'installs the schema at the version the package expects, with every queue, and is repeatable',
    async () => {
      await installJobs(url, { log });
      await installJobs(url, { log });

      expect(await sql<{ version: number }>('SELECT version FROM pgboss.version')).toEqual([
        { version: packageSchema },
      ]);
      const queues = await readQueues();
      expect(queues.map((queue) => queue.name).sort()).toEqual([
        '__pgboss__send-it',
        'dead',
        'mail.prune',
        'mail.send',
      ]);
      for (const { name: queueName, policy, options } of QUEUES) {
        expect(queues.find((queue) => queue.name === queueName)).toMatchObject({
          policy,
          ...options,
        });
      }
    },
    SLOW,
  );

  it(
    'puts a queue changed by hand back to the code, without touching its policy',
    async () => {
      await installJobs(url, { log });
      await sql(
        `UPDATE pgboss.queue SET retry_limit = 1, expire_seconds = 7 WHERE name = 'mail.send'`,
      );
      await installJobs(url, { log });
      const mail = (await readQueues()).find((queue) => queue.name === 'mail.send');
      expect(mail).toMatchObject({ retryLimit: 15, expireInSeconds: 1200, policy: 'standard' });
    },
    SLOW,
  );

  it(
    'leaves no connection to the database behind',
    async () => {
      await installJobs(url, { log });
      // The server ends a backend a moment after its client disconnects; a leaked connection stays.
      await expect
        .poll(
          () =>
            sql<{ n: number }>(
              `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = '${name}'`,
              'postgres',
            ),
          { timeout: 5_000 },
        )
        .toEqual([{ n: 0 }]);
    },
    SLOW,
  );

  it(
    'leaves no index build pending',
    async () => {
      await installJobs(url, { log });
      const open = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM pgboss.bam WHERE status <> 'completed'`,
      );
      expect(open).toEqual([{ n: 0 }]);
    },
    SLOW,
  );

  // The worker may insert queue rows and update some of their columns; pg-boss writes a queue's
  // table_name into the SQL the owner runs, and runs pgboss.bam's commands as the owner. So
  // migrate refuses rows it did not make before it starts pg-boss (security-1, A1b).
  const PLANTED_TABLE = `x_i1 ON pgboss.job (id); GRANT UPDATE ON users TO autoporada_jobs; --`;
  it.each([
    [
      'a partitioned queue',
      `UPDATE pgboss.queue SET partition = true WHERE name = 'mail.prune'`,
      `UPDATE pgboss.queue SET partition = false WHERE name = 'mail.prune'`,
      /queue "mail\.prune" is partitioned/,
    ],
    [
      'a queue it does not know',
      `INSERT INTO pgboss.queue (name, policy, retry_limit, retry_delay, retry_backoff, expire_seconds,
         retention_seconds, deletion_seconds, partition, table_name)
       VALUES ('planted', 'standard', 0, 0, false, 60, 60, 60, false, 'job_common')`,
      `DELETE FROM pgboss.queue WHERE name = 'planted'`,
      /queue "planted" is not one of ours/,
    ],
    [
      'a queue pointed at another table',
      `UPDATE pgboss.queue SET table_name = '${PLANTED_TABLE.replaceAll("'", "''")}' WHERE name = 'mail.prune'`,
      `UPDATE pgboss.queue SET table_name = 'job_common' WHERE name = 'mail.prune'`,
      /queue "mail\.prune" has a table pg-boss did not make/,
    ],
    [
      'a background command not completed',
      `INSERT INTO pgboss.bam (name, version, status, table_name, command)
       VALUES ('planted', 1, 'pending', 'job_common', 'GRANT UPDATE ON users TO autoporada_jobs')`,
      `DELETE FROM pgboss.bam WHERE name = 'planted'`,
      /1 background command "pending"/,
    ],
  ])(
    'refuses to migrate over %s, naming only the queue or the status',
    async (_what, plant, remove, reason) => {
      await installJobs(url, { log });
      await sql(plant);
      try {
        const refused = await installJobs(url, { log }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(refused).toBeInstanceOf(Error);
        const { message } = refused as Error;
        expect(message).toMatch(reason);
        expect(message).not.toMatch(/GRANT|x_i1/);
        // refused before pg-boss started: nothing ran, nothing is left connected
        await expect
          .poll(() => sql(`SELECT 1 FROM pg_stat_activity WHERE datname = '${name}'`, 'postgres'), {
            timeout: 5_000,
          })
          .toEqual([]);
      } finally {
        await sql(remove);
      }
      await expect(installJobs(url, { log })).resolves.toBeUndefined();
    },
    SLOW,
  );

  it(
    'makes a producer that does not migrate refuse a schema it is not written for',
    async () => {
      await installJobs(url, { log });
      await sql(`UPDATE pgboss.version SET version = ${packageSchema - 1}`);
      const producer = createBoss('producer', { url, applicationName: 'autoporada-test', log });
      try {
        await expect(producer.start()).rejects.toThrow(/migrat/i);
      } finally {
        await producer.stop({ graceful: false, close: true });
        await sql(`UPDATE pgboss.version SET version = ${packageSchema}`);
      }
      const healthy = createBoss('producer', { url, applicationName: 'autoporada-test', log });
      try {
        await expect(healthy.start()).resolves.toBe(healthy);
      } finally {
        await healthy.stop({ graceful: false, close: true });
      }
    },
    SLOW,
  );
});
