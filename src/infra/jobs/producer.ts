import { DatabaseError, type PoolClient } from 'pg';

import { DatabaseFailure, TxClosed, type JobName, type JobPort } from '@/application/ports';

import type { Logger } from '../log';
import { sleepOn } from '../system';

import { createBoss, errorCode } from './boss';
import { jobId } from './ids';

interface ProducerOptions {
  readonly url: string;
  readonly applicationName: string;
  /** Runs every connection as this role (see createBoss). */
  readonly role?: string;
  readonly log: Logger;
  /** Pauses between failed starts: `initialMs` doubling up to `maxMs`. */
  readonly retry?: { readonly initialMs: number; readonly maxMs: number };
  /** Waits `ms`, ending early when `signal` aborts. Tests replace it. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const RETRY = { initialMs: 1_000, maxMs: 30_000 };

/**
 * pg-boss throws plain errors where the transaction layer expects port errors (F5). A PostgreSQL
 * error and TxClosed come from the caller's own connection and pass unchanged, so the same
 * mapping as for any other query applies; the rest is pg-boss itself failing.
 */
function toProducerError(error: unknown): unknown {
  if (error instanceof TxClosed || error instanceof DatabaseError) return error;
  if (errorCode(error) === 'PGBOSS_QUEUE_NOT_FOUND') return new DatabaseFailure('42P01');
  return new DatabaseFailure('08000');
}

/**
 * Sends jobs in the caller's transaction. The instance connects only through `start()`, called
 * once from the composition root and outside any transaction; `enqueue` never starts it (F4):
 * a producer that is not up fails at once and the use case rolls back.
 */
export function createProducer(options: ProducerOptions) {
  const { log, retry = RETRY, sleep = sleepOn } = options;
  const boss = createBoss('producer', { ...options, log });
  const stopping = new AbortController();
  let ready = false;
  let starting: Promise<void> | undefined;

  async function startUntilReady(): Promise<void> {
    for (let attempt = 1; !stopping.signal.aborted; attempt += 1) {
      try {
        await boss.start();
        ready = true;
        log.info({ attempt }, 'jobs.producer_ready');
        return;
      } catch (error) {
        const nextMs = Math.min(retry.initialMs * 2 ** (attempt - 1), retry.maxMs);
        // Never the message: it can quote a connection string. A schema behind the code is known by its text.
        const migrations = error instanceof Error && /requires migrations/.test(error.message);
        log.warn(
          { attempt, code: errorCode(error), nextMs, ...(migrations && { hint: 'run migrate' }) },
          'jobs.producer_unavailable',
        );
        await sleep(nextMs, stopping.signal);
      }
    }
  }

  return {
    boss,
    /** Whether the first start has succeeded. */
    get started() {
      return ready;
    },
    /** Starts pg-boss, retrying until it works or `stop()`; the same promise however often it is asked for. */
    start(): Promise<void> {
      starting ??= startUntilReady();
      return starting;
    },
    async stop(): Promise<void> {
      stopping.abort();
      await starting;
      ready = false;
      if (starting) await boss.stop({ graceful: false, close: true });
    },
    jobsOn(client: Pick<PoolClient, 'query'>): JobPort {
      return {
        async enqueue(name: JobName, data, { dedupeKey, startAfter }) {
          if (!ready) throw new DatabaseFailure('08000');
          try {
            // null means a job with this id exists already: deduplicated, which is success
            await boss.send(name, data, {
              id: jobId(name, dedupeKey),
              singletonKey: dedupeKey,
              ...(startAfter && { startAfter }),
              db: { executeSql: (text, values) => client.query(text, values) },
            });
          } catch (error) {
            throw toProducerError(error);
          }
        },
      };
    },
  };
}
