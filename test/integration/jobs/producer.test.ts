import { randomBytes } from 'node:crypto';

import { DatabaseError, type Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseFailure, TxClosed, type JobName } from '@/application/ports';
import { createProducer } from '@/infra/jobs';
import { createLogger } from '@/infra/log';

import { setupTestDatabase } from '../../support/database';
import { adminUrl, databaseUrl, recreateFromTemplate } from '../../support/template-db';

const database = setupTestDatabase();
const SLOW = 30_000;
/** Pauses short enough for a test: the real ones are 1 s doubling to 30 s. */
const QUICK = { initialMs: 20, maxMs: 80 };
const payload = { template: 'access.approved', recipientId: 'r1', subjectId: 's1' } as const;

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return { lines, log: createLogger({ service: 'test', level: 'info', destination }) };
}

const open: { stop(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((producer) => producer.stop()));
});

function producerFor(url: string, extra: { retry?: typeof QUICK } = {}) {
  const { lines, log } = capture();
  const producer = createProducer({
    url,
    applicationName: 'autoporada-producer-test',
    role: 'autoporada_app',
    log,
    ...extra,
  });
  open.push(producer);
  return { producer, lines };
}

async function started() {
  const made = producerFor(databaseUrl(database.name));
  await made.producer.start();
  return made;
}

/** Jobs with this dedupe key, counted by the owner, who sees every transaction's committed state. */
async function jobsFor(key: string): Promise<number> {
  const [row] = await database.owner<{ n: number }>(
    `SELECT count(*)::int AS n FROM pgboss.job WHERE singleton_key = $1`,
    [key],
  );
  return row?.n ?? -1;
}

async function inTransaction<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } finally {
    await client.end();
  }
}

describe('createProducer', () => {
  it(
    'enqueues inside the caller transaction: invisible before COMMIT, there after',
    async () => {
      const { producer } = await started();
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        await producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'commit-1' });
        expect(await jobsFor('commit-1')).toBe(0);
        await client.query('COMMIT');
        expect(await jobsFor('commit-1')).toBe(1);
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it(
    'leaves nothing behind when the transaction rolls back',
    async () => {
      const { producer } = await started();
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        await producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'rollback-1' });
        await client.query('ROLLBACK');
        expect(await jobsFor('rollback-1')).toBe(0);
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it(
    'makes the same key one job, within a transaction and across transactions, without an error',
    async () => {
      const { producer } = await started();
      await inTransaction(async (client) => {
        const port = producer.jobsOn(client);
        await port.enqueue('mail.send', payload, { dedupeKey: 'twice' });
        await expect(
          port.enqueue('mail.send', payload, { dedupeKey: 'twice' }),
        ).resolves.toBeUndefined();
      });
      await inTransaction((client) =>
        producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'twice' }),
      );
      expect(await jobsFor('twice')).toBe(1);
    },
    SLOW,
  );

  it(
    'makes another key a second job',
    async () => {
      const { producer } = await started();
      await inTransaction(async (client) => {
        await producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'a' });
        await producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'b' });
      });
      expect([await jobsFor('a'), await jobsFor('b')]).toEqual([1, 1]);
    },
    SLOW,
  );

  it(
    'treats the same key on another queue as another job',
    async () => {
      const { producer } = await started();
      await inTransaction(async (client) => {
        const port = producer.jobsOn(client);
        await port.enqueue('mail.send', payload, { dedupeKey: 'shared' });
        // `dead` is a real queue but not a job name; the port types forbid it, the id derivation must not care
        await port.enqueue('dead' as JobName, payload, { dedupeKey: 'shared' });
      });
      expect(await jobsFor('shared')).toBe(2);
    },
    SLOW,
  );

  it(
    'keeps the start time it is given',
    async () => {
      const { producer } = await started();
      const later = new Date(Date.now() + 3_600_000);
      await inTransaction((client) =>
        producer
          .jobsOn(client)
          .enqueue('mail.send', payload, { dedupeKey: 'later', startAfter: later }),
      );
      const [row] = await database.owner<{ start_after: Date }>(
        `SELECT start_after FROM pgboss.job WHERE singleton_key = 'later'`,
      );
      expect(Math.abs((row?.start_after.getTime() ?? 0) - later.getTime())).toBeLessThan(1_000);
    },
    SLOW,
  );

  it(
    'stores the payload for the worker to read',
    async () => {
      const { producer } = await started();
      await inTransaction((client) =>
        producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'data' }),
      );
      const [row] = await database.owner<{ data: unknown }>(
        `SELECT data FROM pgboss.job WHERE singleton_key = 'data'`,
      );
      expect(row?.data).toEqual(payload);
    },
    SLOW,
  );
});

describe('enqueue when it cannot work', () => {
  it('fails at once with 08000 when the producer was never started, and starts nothing', async () => {
    const { producer } = producerFor(databaseUrl(database.name));
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await expect(
        producer.jobsOn(client).enqueue('mail.send', payload, { dedupeKey: 'cold' }),
      ).rejects.toEqual(new DatabaseFailure('08000'));
      // the transaction is still usable: the caller rolls back, nothing else happened
      await client.query('SELECT 1');
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
    const sessions = await database.owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'autoporada-producer-test'`,
    );
    expect(sessions).toEqual([{ n: 0 }]);
  });

  it(
    'maps a queue that does not exist to 42P01 and leaves the transaction usable',
    async () => {
      const { producer } = await started();
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        await expect(
          producer.jobsOn(client).enqueue('mail.gone' as JobName, payload, { dedupeKey: 'gone' }),
        ).rejects.toEqual(new DatabaseFailure('42P01'));
        await client.query('SELECT 1');
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it(
    "maps a failure of pg-boss's own pool to 08000",
    async () => {
      const { producer } = await started();
      await producer.boss.stop({ graceful: false, close: true });
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        // an unknown queue needs the cache miss to go to pg-boss's own, now closed, pool
        await expect(
          producer.jobsOn(client).enqueue('mail.gone' as JobName, payload, { dedupeKey: 'pool' }),
        ).rejects.toEqual(new DatabaseFailure('08000'));
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it(
    'lets a PostgreSQL error through for the transaction layer to map',
    async () => {
      const { producer } = await started();
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT nope').catch(() => undefined);
        const error: unknown = await producer
          .jobsOn(client)
          .enqueue('mail.send', payload, { dedupeKey: 'aborted' })
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).code).toBe('25P02');
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it(
    'lets TxClosed through: a leaked enqueue after the transaction must not be disguised',
    async () => {
      const { producer } = await started();
      const closed = {
        query: () => Promise.reject(new TxClosed()),
      } as unknown as Parameters<typeof producer.jobsOn>[0];
      await expect(
        producer.jobsOn(closed).enqueue('mail.send', payload, { dedupeKey: 'leak' }),
      ).rejects.toBeInstanceOf(TxClosed);
    },
    SLOW,
  );
});

describe('start', () => {
  it(
    'retries until the database exists, logging each failure and then the success',
    async () => {
      const name = `autoporada_test_late_${randomBytes(4).toString('hex')}`;
      const { producer, lines } = producerFor(databaseUrl(name), { retry: QUICK });
      const ready = producer.start();
      await expect
        .poll(() => lines.filter((line) => line['msg'] === 'jobs.producer_unavailable').length, {
          timeout: 10_000,
        })
        .toBeGreaterThanOrEqual(2);
      expect(producer.started).toBe(false);

      await recreateFromTemplate(name);
      try {
        await ready;
        expect(producer.started).toBe(true);
        const unavailable = lines.filter((line) => line['msg'] === 'jobs.producer_unavailable');
        expect(unavailable[0]).toMatchObject({ level: 'warn', attempt: 1, code: '3D000' });
        expect(unavailable[1]).toMatchObject({ attempt: 2 });
        expect(lines.at(-1)).toMatchObject({ level: 'info', msg: 'jobs.producer_ready' });
        expect(JSON.stringify(lines)).not.toContain(name);
      } finally {
        await producer.stop();
        const { Client } = await import('pg');
        const admin = new Client({ connectionString: adminUrl() });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        await admin.end();
      }
    },
    SLOW,
  );

  it(
    'waits 1 s, then doubles up to 30 s, by default',
    async () => {
      const waits: number[] = [];
      const { log } = capture();
      const producer = createProducer({
        url: databaseUrl(`autoporada_never_${randomBytes(4).toString('hex')}`),
        applicationName: 'autoporada-producer-test',
        log,
        sleep: (ms) => {
          waits.push(ms);
          if (waits.length >= 8) void producer.stop();
          return Promise.resolve();
        },
      });
      open.push(producer);
      await producer.start();
      expect(waits).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    },
    SLOW,
  );

  it(
    'is one start however often it is asked for',
    async () => {
      const { producer } = producerFor(databaseUrl(database.name));
      expect(producer.start()).toBe(producer.start());
      await producer.start();
      await producer.start();
      expect(producer.started).toBe(true);
    },
    SLOW,
  );

  it(
    'ends the retrying when the producer is stopped, without an error',
    async () => {
      const name = `autoporada_test_never_${randomBytes(4).toString('hex')}`;
      const { producer, lines } = producerFor(databaseUrl(name), { retry: QUICK });
      const ready = producer.start();
      await expect.poll(() => lines.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
      await producer.stop();
      await expect(ready).resolves.toBeUndefined();
      expect(producer.started).toBe(false);
      const seen = lines.length;
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(lines.length).toBe(seen);
    },
    SLOW,
  );
});
