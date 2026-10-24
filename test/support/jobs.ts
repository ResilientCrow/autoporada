/**
 * The integration harness for real pg-boss workers (ADR 0015's test-time rules): fast queue
 * timing on the cloned test database, a worker instance as autoporada_worker, and sleeps that
 * never wait on the wall clock.
 */
import type { PgBoss } from 'pg-boss';
import { afterEach, beforeEach } from 'vitest';

import { createBoss } from '@/infra/jobs';
import { createLogger } from '@/infra/log';
import type { Sleep } from '@/infra/worker';

import type { TestDatabase } from './database';
import { databaseUrl } from './template-db';
import { FixedClock } from './world/clock';

/** What a test may change about a queue; everything else stays as the template made it. */
export interface QueueTiming {
  readonly retryLimit?: number;
  readonly retryDelay?: number;
  readonly expireInSeconds?: number;
}

/** Retries a second apart and a short expiry, so a test sees them in seconds. */
const FAST = { retryDelay: 1, retryBackoff: false, expireInSeconds: 5 };

export function setupJobs(database: TestDatabase) {
  const clock = new FixedClock();
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    service: 'worker',
    level: 'debug',
    destination: { write: (chunk: string) => lines.push(JSON.parse(chunk)) },
  });
  const bosses: PgBoss[] = [];

  beforeEach(async () => {
    await database.owner('TRUNCATE pgboss.job');
    lines.length = 0;
  });
  afterEach(async () => {
    await Promise.all(bosses.splice(0).map((b) => b.stop({ graceful: false, close: true })));
  });

  return {
    clock,
    log,
    /** Every line the workers logged in this test, parsed. */
    lines,
    /** Sets `mail.send`'s timing as the owner; jobs sent afterwards take it. */
    async timing(overrides: QueueTiming = {}) {
      const owner = createBoss('producer', {
        url: databaseUrl(database.name),
        applicationName: 'autoporada-test-timing',
        log,
      });
      await owner.start();
      try {
        await owner.updateQueue('mail.send', { ...FAST, ...overrides });
      } finally {
        await owner.stop({ graceful: false, close: true });
      }
    },
    /** A worker instance running as autoporada_worker, stopped after the test. */
    boss(): PgBoss {
      const boss = createBoss('worker', {
        url: databaseUrl(database.name),
        applicationName: 'autoporada-test-worker',
        role: 'autoporada_worker',
        log,
        clock,
      });
      bosses.push(boss);
      return boss;
    },
    /** An instant `ms` after the test clock's now. */
    later: (ms: number) => new Date(clock.now().getTime() + ms),
    /** A hold that takes no time: the clock jumps instead. */
    instant: (async (ms) => {
      clock.advance(ms);
    }) satisfies Sleep,
    /** Fault hook: a hold that lasts until the worker stops. */
    untilAborted: ((_ms, signal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      })) satisfies Sleep,
  };
}
