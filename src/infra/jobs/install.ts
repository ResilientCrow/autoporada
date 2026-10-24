import type { PgBoss } from 'pg-boss';

import { createLogger, type Logger } from '../log';

import { createBoss } from './boss';
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

/**
 * Installs or upgrades the pg-boss schema and makes the queues match QUEUES. Runs as the schema
 * owner inside `migrate`; every other instance starts with `migrate: false`. Every connection is
 * closed before it returns, so a database cloned from this one meets no session.
 */
export async function installJobs(
  url: string,
  { log = createLogger({ service: 'migrate', level: 'warn' }) }: { log?: Logger } = {},
): Promise<void> {
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
