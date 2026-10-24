import { createLogger } from '../log';

import { createBoss } from './boss';
import { QUEUES } from './queues';

/** The dead-letter queue the operator looks at (QUEUES names it as every other queue's deadLetter). */
const DEAD = 'dead';
/** `findJobs` reads at most this many: more dead jobs than that is an incident, not a list. */
const DEAD_LIST_LIMIT = 1_000;

interface QueueRow {
  readonly queue: string;
  readonly state: string | null;
  readonly n: number;
}

/** A string field of a payload or output object, or null: the only things a listing reads of them. */
function field(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' ? value : null;
}

/** What the CLI's `JobsAdmin` (src/cli/jobs.ts) asks for, declared again because infra cannot see the CLI. */
interface JobsAdminHandle {
  counts(): Promise<{ queue: string; states: Record<string, number> }[]>;
  deadJobs(): Promise<
    {
      id: string;
      sourceQueue: string | null;
      template: string | null;
      dedupeKey: string | null;
      createdAt: Date;
      code: string | null;
    }[]
  >;
  redrive(selector: { ids?: readonly string[]; source?: string }): Promise<number>;
}

/**
 * Opens pg-boss as the connection's own role (the schema owner, for the CLI), runs `run`, and
 * closes every connection. Reads and moves jobs; it starts no worker, supervisor or scheduler.
 */
export async function withJobsAdmin<T>(
  url: string,
  run: (admin: JobsAdminHandle) => Promise<T>,
): Promise<T> {
  const log = createLogger({ service: 'cli', level: 'warn' });
  const boss = createBoss('producer', { url, applicationName: 'autoporada-cli', log });
  await boss.start();
  try {
    return await run({
      async counts() {
        const { rows } = await boss.getDb().executeSql(
          `SELECT q.name AS queue, j.state::text AS state, count(j.id)::int AS n
             FROM pgboss.queue q LEFT JOIN pgboss.job j ON j.name = q.name
            WHERE q.name = ANY($1) GROUP BY q.name, j.state`,
          [QUEUES.map((spec) => spec.name)],
        );
        const byQueue = new Map<string, Record<string, number>>();
        for (const row of rows as QueueRow[]) {
          const states = byQueue.get(row.queue) ?? {};
          if (row.state !== null && row.n > 0) states[row.state] = row.n;
          byQueue.set(row.queue, states);
        }
        return [...byQueue].map(([queue, states]) => ({ queue, states }));
      },
      async deadJobs() {
        const jobs = await boss.findJobs(DEAD, { limit: DEAD_LIST_LIMIT });
        return jobs.map((job) => ({
          id: job.id,
          sourceQueue: job.sourceName,
          template: field(job.data, 'template'),
          dedupeKey: job.singletonKey,
          createdAt: job.sourceCreatedOn ?? job.createdOn,
          code: field(job.sourceOutput, 'code'),
        }));
      },
      redrive: ({ ids, source }) =>
        boss.redrive(DEAD, {
          ...(ids && { ids: [...ids] }),
          ...(source !== undefined && { sourceName: source }),
        }),
    });
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}
