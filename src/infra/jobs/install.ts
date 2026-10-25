import { Client } from 'pg';
import type { PgBoss } from 'pg-boss';

import { createLogger, type Logger } from '../log';

import { createBoss, errorCode } from './boss';
import { QUEUE_INSERT_GRANT, QUEUE_INSERT_REVOKE } from './grants';
import { QUEUES } from './queues';

/** pg-boss's own queue for cron runs; the worker has no right to create it, so the installer does. */
const SEND_IT = '__pgboss__send-it';

interface BamWait {
  readonly pollMs: number;
  readonly timeoutMs: number;
}

const BAM_WAIT: BamWait = { pollMs: 1_000, timeoutMs: 10 * 60_000 };

/**
 * pg-boss builds some indexes in the background (its "bam", every 10 s here). Returns once
 * none is pending or running, and fails on a failed one or after the timeout, naming the counts.
 */
export async function waitForBam(
  boss: Pick<PgBoss, 'getBamStatus'>,
  { pollMs, timeoutMs }: BamWait = BAM_WAIT,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const open = (await boss.getBamStatus()).filter((row) => row.status !== 'completed');
    const summary = open.map((row) => `${row.status} ${row.count}`).join(', ');
    if (open.length === 0) return;
    if (open.some((row) => row.status === 'failed')) {
      throw new Error(`pg-boss background index build failed (${summary})`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`pg-boss background index build did not finish (${summary})`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** The queue table pg-boss itself gives a queue that is not partitioned. */
const SHARED_TABLE = 'job_common';
/** A name as it may appear in an error: quoted, and cut short, since a planted one is free text. */
const quoted = (name: string) => JSON.stringify(name.slice(0, 64));
/** How long migrate waits for the sessions that write pgboss.queue to finish. */
const LOCK_TIMEOUT_MS = 30_000;
/** lock_not_available: the lock timeout ran out. */
const LOCK_TIMEOUT = '55P03';

/** One owner connection named as migrate, closed on every way out. */
async function asOwner<T>(url: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, application_name: 'autoporada-migrate' });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * What in pgboss the installer did not make, as readable reasons. The worker may add queue rows
 * and change some of their columns, and pg-boss writes a queue's table name into the SQL the
 * owner runs (its migrations, the CLI's dead-letter commands) and runs every pgboss.bam command
 * as the owner. So migrate looks first. Names queues and statuses only, never what a row holds.
 */
async function foreignRows(
  client: Client,
  tables: { readonly queue: boolean; readonly bam: boolean },
): Promise<string[]> {
  const reasons: string[] = [];
  if (tables.queue) {
    const known = new Set([...QUEUES.map((spec) => spec.name), SEND_IT]);
    const { rows } = await client.query<{ name: string; partition: boolean; ours: boolean }>(
      `SELECT name, partition, table_name = $1 AS ours FROM pgboss.queue ORDER BY name`,
      [SHARED_TABLE],
    );
    for (const { name, partition, ours } of rows) {
      if (!known.has(name)) reasons.push(`queue ${quoted(name)} is not one of ours`);
      if (partition) reasons.push(`queue ${quoted(name)} is partitioned`);
      if (!ours) reasons.push(`queue ${quoted(name)} has a table pg-boss did not make`);
    }
  }
  if (tables.bam) {
    const { rows } = await client.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM pgboss.bam
        WHERE status <> 'completed' GROUP BY 1 ORDER BY 1`,
    );
    for (const { status, n } of rows) {
      reasons.push(`${n} background command${n === 1 ? '' : 's'} ${quoted(status)}`);
    }
  }
  return reasons;
}

/**
 * Shuts the worker out of pgboss.queue and checks what pgboss holds, in one transaction. The
 * worker may insert queue rows (create_queue at every start), so its INSERT is revoked first and
 * the SHARE lock waits for every insert in flight to commit or roll back; no row can then appear
 * unchecked. Commits when nothing is foreign, so the revoke holds while pg-boss migrates; rolls
 * back and throws otherwise. Returns whether a revoke was committed.
 */
async function shutOutAndCheck(url: string, lockTimeoutMs: number): Promise<boolean> {
  return asOwner(url, async (client) => {
    await client.query('BEGIN');
    try {
      const { rows } = await client.query<{ queue: boolean; bam: boolean }>(
        `SELECT to_regclass('pgboss.queue') IS NOT NULL AS queue,
                to_regclass('pgboss.bam') IS NOT NULL AS bam`,
      );
      const tables = { queue: rows[0]?.queue === true, bam: rows[0]?.bam === true };
      if (tables.queue) {
        await client.query(`SELECT set_config('lock_timeout', $1, true)`, [`${lockTimeoutMs}ms`]);
        await client.query(QUEUE_INSERT_REVOKE);
        await client.query('LOCK TABLE pgboss.queue IN SHARE MODE');
      }
      const foreign = await foreignRows(client, tables);
      if (foreign.length > 0) {
        throw new Error(
          `migrate: pgboss holds what migrate did not make (${foreign.join('; ')}); ` +
            'pg-boss was left as it is. Find out how it got there before removing it (docs/adr/0015).',
        );
      }
      await client.query('COMMIT');
      return tables.queue;
    } catch (error) {
      await client.query('ROLLBACK');
      if (errorCode(error) !== LOCK_TIMEOUT) throw error;
      throw new Error(
        `migrate: a session holds pgboss.queue, so it could not be checked within ` +
          `${lockTimeoutMs / 1_000} s; pg-boss was left as it is. Stop the worker, then run migrate again.`,
        { cause: error },
      );
    }
  });
}

/** Starts pg-boss as the owner, which installs or upgrades its schema, and sets the queues. */
async function install(url: string, log: Logger): Promise<void> {
  const boss = createBoss('installer', { url, applicationName: 'autoporada-migrate', log });
  try {
    await boss.start();
    for (const { name, policy, options } of QUEUES) {
      // createQueue keeps an existing queue as it is; updateQueue refuses any `policy`, even an unchanged one.
      await boss.createQueue(name, { policy, ...options });
      await boss.updateQueue(name, options);
    }
    await boss.createQueue(SEND_IT);
    await waitForBam(boss);
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}

/**
 * Installs or upgrades the pg-boss schema and makes the queues match QUEUES. Runs as the schema
 * owner inside `migrate`; every other instance starts with `migrate: false`. The worker cannot
 * insert into pgboss.queue from the check until this returns, whether it migrated or failed.
 * Every connection is closed before it returns, so a database cloned from this one meets no
 * session.
 */
export async function installJobs(
  url: string,
  {
    log = createLogger({ service: 'migrate', level: 'warn' }),
    lockTimeoutMs = LOCK_TIMEOUT_MS,
  }: { log?: Logger; lockTimeoutMs?: number } = {},
): Promise<void> {
  const revoked = await shutOutAndCheck(url, lockTimeoutMs);
  try {
    await install(url, log);
  } finally {
    // A failed migrate must not leave a restarting worker unable to start.
    if (revoked) await asOwner(url, (client) => client.query(QUEUE_INSERT_GRANT));
  }
}
