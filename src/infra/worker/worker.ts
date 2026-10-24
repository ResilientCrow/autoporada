import type { PgBoss } from 'pg-boss';

import {
  JOB_NAMES,
  type JobCatalog,
  type JobHandlers,
  type JobName,
  type ScheduledJob,
  type WorkerDeps,
} from '@/application/ports';
import { errorCode, QUEUES } from '@/infra/jobs';
import type { Logger } from '@/infra/log';
import { sleepOn } from '@/infra/system';

import { STOP_TIMEOUT_MS } from './limits';
import { runJob, type RunContext, type Sleep } from './run-job';
import { syncSchedules } from './schedules';

export interface WorkerOptions {
  /** A `createBoss('worker', …)` instance, not started. */
  readonly boss: PgBoss;
  readonly handlers: JobHandlers;
  /** The resolved cron registry; synced after the start, before any queue is worked. */
  readonly schedules: readonly ScheduledJob[];
  readonly deps: WorkerDeps;
  readonly log: Logger;
  /** How often an idle queue is polled. */
  readonly pollSeconds: number;
  /** Holds and start retries wait through it; tests make it instant. */
  readonly sleep?: Sleep;
  /** How long a failing start is retried before the worker gives up (60 s). */
  readonly startWithinMs?: number;
  /** Fields of the `worker.ready` line besides the queues: version, schema, transport. */
  readonly facts?: Readonly<Record<string, unknown>>;
  /**
   * The process's stop (SIGTERM), which may come while the worker starts: it then registers no
   * more queues and stops pg-boss as `stop()` does before it resolves, so no call is left running.
   */
  readonly signal?: AbortSignal;
}

export interface RunningWorker {
  /** Ends every hold, starts no new handler call, then lets pg-boss finish what is in flight. */
  stop(): Promise<void>;
}

/** pg-boss's start, retried from 1 s doubling until `withinMs` has passed or `signal` aborts. */
async function startBoss(
  { boss, log, deps, sleep = sleepOn, startWithinMs = 60_000 }: WorkerOptions,
  signal: AbortSignal,
): Promise<void> {
  const giveUpAt = deps.clock.now().getTime() + startWithinMs;
  for (let attempt = 1, delayMs = 1_000; !signal.aborted; attempt += 1, delayMs *= 2) {
    try {
      await boss.start();
      return;
    } catch (error) {
      // Never the message: it can quote a connection string. A schema behind the code is known by its text.
      const migrations = error instanceof Error && /requires migrations/.test(error.message);
      const hint = migrations ? 'run migrate' : undefined;
      log.warn({ attempt, code: errorCode(error), hint }, 'worker.start_failed');
      if (deps.clock.now().getTime() + delayMs > giveUpAt) {
        throw new Error(`worker: the job queue did not start in ${startWithinMs} ms`, {
          cause: hint ?? errorCode(error),
        });
      }
      await sleep(delayMs, signal);
    }
  }
}

/** Code is the source of truth for queue settings (installJobs); a difference is worth a warning. */
async function checkQueues(boss: PgBoss, log: Logger): Promise<void> {
  for (const spec of QUEUES) {
    const queue = await boss.getQueue(spec.name);
    if (!queue) throw new Error(`worker: queue ${spec.name} is missing; run migrate`);
    for (const [option, value] of Object.entries(spec.options)) {
      if (Reflect.get(queue, option) !== value) {
        log.warn({ queue: spec.name, option }, 'worker.queue_drift');
      }
    }
  }
}

/** One poller per queue, one job at a time, each settled with its own code-only result. */
function workOn<N extends JobName>(boss: PgBoss, name: N, options: WorkerOptions, run: RunContext) {
  const handler = options.handlers[name];
  const work = {
    localConcurrency: 1,
    batchSize: 1,
    perJobResults: true,
    includeMetadata: true,
    pollingIntervalSeconds: options.pollSeconds,
  } as const;
  // All three type arguments: naming only the payload would drop the options' literal types.
  return boss.work<JobCatalog[N], unknown, typeof work>(name, work, (jobs) =>
    Promise.all(
      jobs.map((job) =>
        runJob(
          {
            id: job.id,
            name,
            data: job.data,
            retryCount: job.retryCount,
            singletonKey: job.singletonKey,
            signal: job.signal,
          },
          handler,
          run,
        ),
      ),
    ),
  );
}

/**
 * Starts pg-boss, syncs the schedules, and works every queue of the catalogue through `runJob`.
 * When `options.signal` aborts first, it stops between steps and resolves once stopped.
 */
export async function startWorker(options: WorkerOptions): Promise<RunningWorker> {
  const { boss, deps, log, sleep = sleepOn } = options;
  const shutdown = new AbortController();
  const stopped = options.signal
    ? AbortSignal.any([shutdown.signal, options.signal])
    : shutdown.signal;
  let stopping: Promise<void> | undefined;
  const running: RunningWorker = {
    stop() {
      shutdown.abort();
      stopping ??= boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      return stopping;
    },
  };
  await startBoss(options, stopped);
  if (!stopped.aborted) await checkQueues(boss, log);
  if (!stopped.aborted) await syncSchedules(boss, options.schedules, log);
  const run: RunContext = { deps, sleep, shutdown: stopped, log };
  for (const name of JOB_NAMES) {
    if (stopped.aborted) break;
    await workOn(boss, name, options, run);
  }
  if (stopped.aborted) {
    await running.stop();
    return running;
  }
  log.info(
    { ...options.facts, queues: JOB_NAMES, pollSeconds: options.pollSeconds },
    'worker.ready',
  );
  return running;
}
