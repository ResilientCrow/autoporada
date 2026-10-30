import { randomBytes } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '@/infra/log';
import {
  PGBOSS_SCHEMA_VERSION,
  QUEUES,
  applyJobGrants,
  createBoss,
  installJobs,
} from '@/infra/jobs';

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

/** Installs pg-boss and grants the roles their rights, as `migrate` does. */
async function installedWithGrants() {
  await installJobs(url, { log });
  const owner = new Client({ connectionString: url });
  await owner.connect();
  try {
    await applyJobGrants(owner);
  } finally {
    await owner.end();
  }
}

/** One connection as the worker's login, as its pool runs. */
async function asWorker(): Promise<Client> {
  const client = new Client({ connectionString: url, options: '-c role=autoporada_worker' });
  await client.connect();
  return client;
}

/** A queue row as the worker writes one: pg-boss's create_queue of its cron queue, at every start. */
const queueRow = (queue: string, partition: boolean, table: string) =>
  `INSERT INTO pgboss.queue (name, policy, retry_limit, retry_delay, retry_backoff, expire_seconds,
     retention_seconds, deletion_seconds, partition, table_name)
   VALUES ('${queue}', 'standard', 0, 0, false, 60, 60, 60, ${partition}, '${table.replaceAll("'", "''")}')
   ON CONFLICT DO NOTHING`;
const CRON_QUEUE = queueRow('__pgboss__send-it', false, 'job_common');

/** The SQLSTATE the worker's insert of the cron queue fails with; undefined if it succeeds. */
async function workerInsert(): Promise<string | undefined> {
  const worker = await asWorker();
  try {
    await worker.query(CRON_QUEUE);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await worker.end();
  }
}

/** Sessions of migrate (the check, or the installer's pool) waiting for a lock. */
const migrateWaits = async () =>
  (
    await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = '${name}' AND application_name = 'autoporada-migrate'
          AND wait_event_type = 'Lock'`,
      'postgres',
    )
  )[0]?.n ?? 0;

const DENIED = '42501';

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
        'future.report-prompt',
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

  // The worker keeps INSERT on pgboss.queue (create_queue at every start), so a check on its own
  // would race it. Migrate revokes that insert, then checks under a SHARE lock, which waits for
  // every insert in flight, and keeps the worker out until pg-boss has migrated (r2-security-1).
  it(
    'waits for a worker insert in flight, then refuses the queue it planted',
    async () => {
      await installedWithGrants();
      const worker = await asWorker();
      try {
        await worker.query('BEGIN');
        await worker.query(queueRow('planted', true, PLANTED_TABLE));
        let settled = false;
        const install = installJobs(url, { log })
          .then(
            () => 'migrated',
            (error: unknown) => error,
          )
          .finally(() => {
            settled = true;
          });
        await expect
          .poll(async () => settled || (await migrateWaits()) > 0, { timeout: 10_000 })
          .toBe(true);
        await worker.query('COMMIT');
        const refused = await install;
        expect(refused).toBeInstanceOf(Error);
        const { message } = refused as Error;
        expect(message).toMatch(/queue "planted" is partitioned/);
        expect(message).not.toMatch(/GRANT|x_i1/);
      } finally {
        await worker.end();
      }
      // The refusal rolled the revoke back with the check.
      expect(await workerInsert()).toBeUndefined();
    },
    SLOW,
  );

  it(
    'denies the worker any queue insert while pg-boss migrates, and gives it back after',
    async () => {
      await installedWithGrants();
      // Holding pgboss.version stops the installer at boss.start, after the check committed.
      const holder = new Client({ connectionString: url });
      await holder.connect();
      let install: Promise<void> | undefined;
      try {
        await holder.query('BEGIN');
        await holder.query('LOCK TABLE pgboss.version IN ACCESS EXCLUSIVE MODE');
        install = installJobs(url, { log });
        await expect.poll(migrateWaits, { timeout: 10_000 }).toBeGreaterThan(0);
        expect(await workerInsert()).toBe(DENIED);
        await holder.query('COMMIT');
        await install;
      } finally {
        await holder.end();
        // A failed assertion above must not leave the installer running into the next test.
        await Promise.allSettled([install]);
      }
      expect(await workerInsert()).toBeUndefined();
    },
    SLOW,
  );

  it(
    'gives the worker its insert back when the migration fails, so a restarting worker starts',
    async () => {
      await installedWithGrants();
      // updateQueue writes mail.send's retry limit, and this CHECK refuses it.
      await sql(
        `ALTER TABLE pgboss.queue ADD CONSTRAINT forced_failure CHECK (retry_limit <> 15) NOT VALID`,
      );
      try {
        await expect(installJobs(url, { log })).rejects.toThrow(/forced_failure/);
      } finally {
        await sql(`ALTER TABLE pgboss.queue DROP CONSTRAINT forced_failure`);
      }
      expect(await workerInsert()).toBeUndefined();
      const worker = createBoss('worker', {
        url,
        applicationName: 'autoporada-test',
        role: 'autoporada_worker',
        log,
      });
      try {
        await expect(worker.start()).resolves.toBe(worker);
      } finally {
        await worker.stop({ graceful: false, close: true });
      }
    },
    SLOW,
  );

  it(
    'refuses when a session holds pgboss.queue past the lock timeout, naming the cause',
    async () => {
      await installedWithGrants();
      const worker = await asWorker();
      try {
        await worker.query('BEGIN');
        await worker.query(CRON_QUEUE);
        const refused = await installJobs(url, { log, lockTimeoutMs: 200 }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(refused).toBeInstanceOf(Error);
        const { message } = refused as Error;
        expect(message).toMatch(/a session holds pgboss\.queue/);
        expect(message).toMatch(/stop the worker, then run migrate again/i);
      } finally {
        await worker.query('ROLLBACK');
        await worker.end();
      }
      expect(await workerInsert()).toBeUndefined();
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
