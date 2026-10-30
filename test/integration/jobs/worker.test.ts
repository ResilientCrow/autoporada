import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import {
  system,
  type JobHandler,
  type JobInput,
  type JobOutcome,
  type ScheduledJob,
  type WorkerDeps,
} from '@/application/ports';
import { createBoss, jobId } from '@/infra/jobs';
import { startWorker, type Sleep } from '@/infra/worker';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const SLOW = 30_000;
const DATA = { template: 'access.approved', recipientId: 'r-1', subjectId: 's-1' } as const;

type Step = JobOutcome | Error;
const purged: JobOutcome = { kind: 'done', code: 'purged' };
const PRUNE: ScheduledJob = {
  job: 'mail.prune',
  key: 'daily',
  cron: '10 5 * * *',
  data: {},
  missed: 'once',
};

/** A worker whose `mail.send` handler plays `script`, one step per call, as autoporada_worker. */
async function workerFor(
  script: Step[],
  sleep: Sleep = jobs.instant,
  facts?: Record<string, unknown>,
) {
  const calls: JobInput<'mail.send'>[] = [];
  const handler: JobHandler<'mail.send'> = async (deps, job) => {
    calls.push(job);
    // The handler's own transactions run as the worker too: only it may read the ledger.
    await deps.db.transaction(
      { principal: system('job:test'), now: deps.clock.now(), requestId: job.id },
      { mode: 'read' },
      (tx) => tx.mailLedger.get('worker-test'),
    );
    const step = script.shift() ?? { kind: 'retry', code: 'script.empty' };
    if (step instanceof Error) throw step;
    return step;
  };
  const deps = {
    db: database.worker,
    clock: jobs.clock,
    appOrigin: 'https://autoporada.test',
  } as unknown as WorkerDeps;
  const boss = jobs.boss();
  const worker = await startWorker({
    boss,
    handlers: {
      'mail.send': handler,
      'mail.prune': () => Promise.resolve(purged),
      'future.report-prompt': () => Promise.resolve(purged),
      'reminders.deadline': () => Promise.resolve(purged),
    },
    schedules: [PRUNE],
    deps,
    log: jobs.log,
    pollSeconds: 0.5,
    sleep,
    facts,
  });
  return { boss, worker, calls };
}

/** Sends as the web would: the id derived from the key, the key kept for humans. */
async function send(boss: PgBoss, key: string): Promise<string> {
  const id = jobId('mail.send', key);
  await boss.send('mail.send', DATA, { id, singletonKey: key });
  return id;
}

interface JobRow {
  state: string;
  retry_count: number;
  output: unknown;
}
const row = async (id: string) =>
  (
    await database.owner<JobRow>(
      `SELECT state, retry_count, output FROM pgboss.job WHERE name = 'mail.send' AND id = $1`,
      [id],
    )
  )[0];
const deadCopies = (id: string) =>
  database.owner<{ data: unknown; source_output: unknown; state: string }>(
    `SELECT data, source_output, state FROM pgboss.job WHERE name = 'dead' AND source_id = $1`,
    [id],
  );
const settled = (id: string, state: string) =>
  expect.poll(async () => (await row(id))?.state, { timeout: 15_000 }).toBe(state);

describe('startWorker over pg-boss (as autoporada_worker)', () => {
  it(
    'logs worker.ready once, with the facts the composition root hands it',
    async () => {
      await jobs.timing();
      await workerFor([], jobs.instant, { version: '1.2.3', transport: 'smtp' });
      const ready = jobs.lines.filter((l) => l['msg'] === 'worker.ready');
      expect(ready).toHaveLength(1);
      expect(ready[0]).toMatchObject({ version: '1.2.3', transport: 'smtp', pollSeconds: 0.5 });
    },
    SLOW,
  );

  it(
    'retries a failed attempt and completes the next one, keeping only the code',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const { boss, calls } = await workerFor([
        { kind: 'retry', code: 'net.ENOTFOUND' },
        { kind: 'done', code: 'sent' },
      ]);
      const id = await send(boss, 'access.approved:retry');
      await settled(id, 'completed');
      expect(await row(id)).toEqual({
        state: 'completed',
        retry_count: 1,
        output: { code: 'sent' },
      });
      expect(calls.map((c) => c.attempt)).toEqual([1, 2]);
      expect(jobs.lines.filter((l) => l['msg'] === 'worker.ready')).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'dead-letters a job whose retries ran out; an error with an address reaches pg-boss as a code',
    async () => {
      await jobs.timing({ retryLimit: 2 });
      const failure = () => new Error('smtp: mailbox jana.novakova@ssps.cz is full');
      const { boss, calls } = await workerFor([failure(), failure(), failure()]);
      const id = await send(boss, 'access.approved:exhausted');
      await settled(id, 'failed');
      expect(calls).toHaveLength(3);
      expect(await row(id)).toMatchObject({ retry_count: 2, output: { code: 'error.Error' } });
      expect(await deadCopies(id)).toEqual([
        { data: DATA, source_output: { code: 'error.Error' }, state: 'created' },
      ]);
      const everything = await database.owner(`SELECT output, source_output FROM pgboss.job`);
      expect(JSON.stringify([everything, jobs.lines])).not.toContain('@ssps.cz');
    },
    SLOW,
  );

  it(
    'sends a dead outcome to the dead letters at once, skipping the retries',
    async () => {
      await jobs.timing({ retryLimit: 15 });
      const { boss, calls } = await workerFor([{ kind: 'dead', code: 'rejected.400' }]);
      const id = await send(boss, 'access.approved:rejected');
      await settled(id, 'failed');
      expect(calls).toHaveLength(1);
      expect(await row(id)).toMatchObject({ retry_count: 0, output: { code: 'rejected.400' } });
      expect(await deadCopies(id)).toMatchObject([{ source_output: { code: 'rejected.400' } }]);
    },
    SLOW,
  );

  it(
    'ends a hold on stop, burning one retry, and the next worker runs the job again',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const wait: JobOutcome = { kind: 'wait', until: jobs.later(600_000), code: 'wait.gate' };
      const first = await workerFor([wait], jobs.untilAborted);
      const id = await send(first.boss, 'access.approved:held');
      await expect.poll(() => first.calls.length, { timeout: 15_000 }).toBe(1);
      await first.worker.stop();
      expect(await row(id)).toMatchObject({ state: 'retry', output: { code: 'shutdown' } });
      expect(first.calls).toHaveLength(1);

      const second = await workerFor([{ kind: 'done', code: 'sent' }]);
      await settled(id, 'completed');
      expect(await row(id)).toMatchObject({ retry_count: 1, output: { code: 'sent' } });
      expect(second.calls.map((c) => c.attempt)).toEqual([2]);
    },
    SLOW,
  );

  it(
    'calls no handler once stopped',
    async () => {
      await jobs.timing();
      const { worker, calls } = await workerFor([{ kind: 'done', code: 'sent' }]);
      await worker.stop();
      const producer = jobs.boss();
      await producer.start();
      const id = await send(producer, 'access.approved:after-stop');
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(calls).toEqual([]);
      expect(await row(id)).toMatchObject({ state: 'created' });
    },
    SLOW,
  );

  it(
    'retries a failing start from 1 s doubling, then gives up with a clear error',
    async () => {
      const boss = createBoss('worker', {
        url: 'postgres://nobody@127.0.0.1:9/nothing',
        applicationName: 'autoporada-test-unreachable',
        log: jobs.log,
      });
      const deps = { clock: jobs.clock } as unknown as WorkerDeps;
      const starting = startWorker({
        boss,
        handlers: {
          'mail.send': () => Promise.resolve({ kind: 'done', code: 'sent' }),
          'mail.prune': () => Promise.resolve(purged),
          'future.report-prompt': () => Promise.resolve(purged),
          'reminders.deadline': () => Promise.resolve(purged),
        },
        schedules: [PRUNE],
        deps,
        log: jobs.log,
        pollSeconds: 0.5,
        sleep: jobs.instant,
        startWithinMs: 5_000,
      });
      await expect(starting).rejects.toThrow('worker: the job queue did not start in 5000 ms');
      // tries at 0, 1 and 3 s; a fourth after 4 more would end past 5 s
      expect(jobs.lines.filter((l) => l['msg'] === 'worker.start_failed')).toHaveLength(3);
      await boss.stop({ graceful: false, close: true });
    },
    SLOW,
  );

  describe('a stop signal that comes while it starts (SIGTERM during boot)', () => {
    const handlers = (send: JobHandler<'mail.send'>) => ({
      'mail.send': send,
      'mail.prune': () => Promise.resolve(purged),
      'future.report-prompt': () => Promise.resolve(purged),
      'reminders.deadline': () => Promise.resolve(purged),
    });
    const deps = () =>
      ({
        db: database.worker,
        clock: jobs.clock,
        appOrigin: 'https://x.test',
      }) as unknown as WorkerDeps;

    it(
      'registers no more queues and stops pg-boss once the call in flight has finished',
      async () => {
        await jobs.timing();
        const producer = jobs.boss();
        await producer.start();
        const id = await send(producer, 'access.approved:boot');

        const stopping = new AbortController();
        const boss = jobs.boss();
        let started!: () => void;
        const handlerStarted = new Promise<void>((resolve) => (started = resolve));
        const registered: string[] = [];
        const work = boss.work.bind(boss) as (...args: unknown[]) => Promise<string>;
        // mail.send is registered first and fetches the queued job; the signal comes while
        // startWorker is still awaiting that registration, before mail.prune
        Reflect.set(boss, 'work', async (name: string, ...rest: unknown[]) => {
          if (stopping.signal.aborted) throw new Error(`${name} registered after the stop`);
          registered.push(name);
          const workerId = await work(name, ...rest);
          if (name === 'mail.send') {
            await handlerStarted;
            stopping.abort();
          }
          return workerId;
        });
        let finished = false;
        const worker = await startWorker({
          boss,
          handlers: handlers(async () => {
            started();
            await new Promise((resolve) => setTimeout(resolve, 1_000));
            finished = true;
            return { kind: 'done', code: 'sent' };
          }),
          schedules: [PRUNE],
          deps: deps(),
          log: jobs.log,
          pollSeconds: 0.5,
          sleep: jobs.instant,
          signal: stopping.signal,
        });
        // resolved only after the call that was running finished and pg-boss settled it
        expect(finished).toBe(true);
        expect(registered).toEqual(['mail.send']);
        expect(await row(id)).toMatchObject({ state: 'completed', output: { code: 'sent' } });
        expect(jobs.lines.map((l) => l['msg'])).not.toContain('worker.ready');
        await expect(worker.stop()).resolves.toBeUndefined();
      },
      SLOW,
    );

    it(
      'works nothing when the signal came before the start',
      async () => {
        await jobs.timing();
        const producer = jobs.boss();
        await producer.start();
        const id = await send(producer, 'access.approved:before-boot');
        const calls: unknown[] = [];
        const worker = await startWorker({
          boss: jobs.boss(),
          handlers: handlers((_deps, job) => {
            calls.push(job);
            return Promise.resolve({ kind: 'done', code: 'sent' });
          }),
          schedules: [PRUNE],
          deps: deps(),
          log: jobs.log,
          pollSeconds: 0.5,
          sleep: jobs.instant,
          signal: AbortSignal.abort(),
        });
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        expect(calls).toEqual([]);
        expect(await row(id)).toMatchObject({ state: 'created' });
        await worker.stop();
      },
      SLOW,
    );

    it(
      'gives up retrying a failing start without an error',
      async () => {
        const stopping = new AbortController();
        const boss = createBoss('worker', {
          url: 'postgres://nobody@127.0.0.1:9/nothing',
          applicationName: 'autoporada-test-unreachable',
          log: jobs.log,
        });
        const worker = await startWorker({
          boss,
          handlers: handlers(() => Promise.resolve({ kind: 'done', code: 'sent' })),
          schedules: [PRUNE],
          deps: { clock: jobs.clock } as unknown as WorkerDeps,
          log: jobs.log,
          pollSeconds: 0.5,
          // the signal comes during the first pause between attempts
          sleep: async () => {
            stopping.abort();
          },
          startWithinMs: 60_000,
          signal: stopping.signal,
        });
        expect(jobs.lines.filter((l) => l['msg'] === 'worker.start_failed')).toHaveLength(1);
        await worker.stop();
      },
      SLOW,
    );
  });

  it(
    'registers the schedules while it starts, before it reports ready',
    async () => {
      await jobs.timing();
      await database.owner('DELETE FROM pgboss.schedule');
      await workerFor([]);
      const order = jobs.lines.map((l) => l['msg']);
      expect(order.indexOf('cron.registered')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('cron.registered')).toBeLessThan(order.indexOf('worker.ready'));
      expect(await database.owner(`SELECT name, key FROM pgboss.schedule`)).toEqual([
        { name: 'mail.prune', key: 'daily' },
      ]);
    },
    SLOW,
  );

  it(
    'warns about queue settings that differ from the code',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      await workerFor([]);
      expect(jobs.lines).toContainEqual(
        expect.objectContaining({
          msg: 'worker.queue_drift',
          queue: 'mail.send',
          option: 'retryLimit',
        }),
      );
    },
    SLOW,
  );
});
