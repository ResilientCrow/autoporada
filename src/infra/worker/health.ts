import { writeFile } from 'node:fs/promises';

import type { Clock } from '@/application/ports';
import type { Logger } from '@/infra/log';

import { errorCode } from '../jobs';

/** What compose's healthcheck reads (deploy/compose.yaml): its age in the file's mtime. */
const ALIVE_PATH = '/tmp/worker.alive';
export const HEALTH_INTERVAL_MS = 15_000;
/** The file is touched only while the database has answered within this long (the check reads 60 s). */
export const HEALTH_FRESH_MS = 60_000;

interface HealthOptions {
  /** `SELECT 1` on the worker's pool. */
  readonly ping: () => Promise<unknown>;
  readonly clock: Clock;
  readonly path?: string;
  /** Writes the file; tests that drive timers replace it. */
  readonly write?: (path: string, content: string) => Promise<void>;
}

/**
 * The alive file says "the database answers", nothing more: a Graph outage must not make
 * the worker unhealthy (a restart cannot fix it), a dead database must.
 */
export function createHealth({ ping, clock, path = ALIVE_PATH, write = writeFile }: HealthOptions) {
  let lastAnswer: number | undefined;
  return {
    /** Pings, then touches the file if the last answer is fresh. A failed ping is not an error here. */
    async tick(): Promise<void> {
      try {
        await ping();
        lastAnswer = clock.now().getTime();
      } catch {
        // counted by the age of the last answer
      }
      if (lastAnswer !== undefined && clock.now().getTime() - lastAnswer <= HEALTH_FRESH_MS) {
        await write(path, String(lastAnswer));
      }
    },
  };
}

/**
 * Ticks now and every 15 s. A tick that is still waiting on the database is not joined by
 * another, so a hanging database costs one pending query, and the file goes stale.
 */
export function startHealth(options: HealthOptions & { readonly log: Pick<Logger, 'warn'> }) {
  const health = createHealth(options);
  let running = false;
  const run = (): void => {
    if (running) return;
    running = true;
    health
      .tick()
      .catch((error: unknown) => {
        options.log.warn({ code: errorCode(error) }, 'worker.health_failed');
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, HEALTH_INTERVAL_MS);
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
