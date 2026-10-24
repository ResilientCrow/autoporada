import { randomBytes } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
      const sessions = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = '${name}'`,
        'postgres',
      );
      expect(sessions).toEqual([{ n: 0 }]);
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

  it(
    'makes a producer that does not migrate refuse a schema it is not written for',
    async () => {
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
