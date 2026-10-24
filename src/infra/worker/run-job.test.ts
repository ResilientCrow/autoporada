import { describe, expect, it } from 'vitest';

import type { JobHandler, JobInput, JobOutcome, WorkerDeps } from '@/application/ports';
import { jobId } from '@/infra/jobs';
import { createLogger } from '@/infra/log';

import { FixedClock } from '../../../test/support/world/clock';
import { HOLD_MS, runJob, type FetchedJob, type Sleep } from './index';

const SECOND = 1_000;
const KEY = 'access.approved:s-1';
const DATA = { template: 'access.approved', recipientId: 'r-1', subjectId: 's-1' } as const;

type Step = JobOutcome | Error | ((h: Harness) => JobOutcome);
type Harness = ReturnType<typeof harness>;

/** A runner over a scripted handler, a FixedClock and a sleep that only moves the clock. */
function harness(...script: Step[]) {
  const clock = new FixedClock();
  const shutdown = new AbortController();
  const claim = new AbortController();
  const calls: JobInput<'mail.send'>[] = [];
  const sleeps: { ms: number; signal: AbortSignal }[] = [];
  const lines: Record<string, unknown>[] = [];
  let duringSleep = (): void => undefined;
  const self = {
    clock,
    shutdown,
    claim,
    calls,
    sleeps,
    lines,
    duringSleep: (act: () => void) => {
      duringSleep = act;
    },
    later: (ms: number) => new Date(clock.now().getTime() + ms),
    run: (job: Partial<FetchedJob<'mail.send'>> = {}) =>
      runJob(
        {
          id: jobId('mail.send', KEY),
          name: 'mail.send',
          data: DATA,
          retryCount: 0,
          singletonKey: KEY,
          signal: claim.signal,
          ...job,
        },
        handler,
        { deps: { clock } as unknown as WorkerDeps, sleep, shutdown: shutdown.signal, log },
      ),
  };
  const sleep: Sleep = async (ms, signal) => {
    sleeps.push({ ms, signal });
    clock.advance(ms);
    duringSleep();
  };
  const handler: JobHandler<'mail.send'> = async (_deps, input) => {
    calls.push(input);
    const step = script.shift();
    if (step === undefined) throw new Error('the script ran out');
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(self) : step;
  };
  const log = createLogger({
    service: 'worker',
    level: 'debug',
    destination: { write: (chunk: string) => lines.push(JSON.parse(chunk)) },
  });
  return self;
}

const sent: JobOutcome = { kind: 'done', code: 'sent' };
const waitFor =
  (ms: number, code = 'wait.gate') =>
  (h: Harness): JobOutcome => ({ kind: 'wait', until: h.later(ms), code });

describe('runJob', () => {
  it.each([
    ['done', 'completed'],
    ['retry', 'failed'],
    ['dead', 'deadletter'],
  ] as const)('settles %s as %s with the code as the only output', async (kind, status) => {
    const h = harness({ kind, code: 'rejected.400' });
    expect(await h.run()).toEqual({
      id: jobId('mail.send', KEY),
      status,
      output: { code: 'rejected.400' },
    });
  });

  it('hands the handler the payload, the attempt and the key', async () => {
    const h = harness(sent);
    await h.run({ retryCount: 3 });
    expect(h.calls).toEqual([
      { id: jobId('mail.send', KEY), data: DATA, attempt: 4, dedupeKey: KEY, redriven: false },
    ]);
  });

  it('tells a redriven job by its id, which is not the one its key derives', async () => {
    const h = harness(sent, sent);
    await h.run({ id: '0b6e9a7c-1d2f-4e3a-8b5c-6d7e8f9a0b1c' });
    await h.run({ singletonKey: null });
    expect(h.calls.map((c) => [c.redriven, c.dedupeKey])).toEqual([
      [true, KEY],
      [false, null],
    ]);
  });

  it('holds once for a full Retry-After and asks again, burning no retry', async () => {
    const h = harness(waitFor(HOLD_MS), sent);
    expect(await h.run()).toMatchObject({ status: 'completed', output: { code: 'sent' } });
    expect(h.sleeps.map((s) => s.ms)).toEqual([HOLD_MS]);
    expect(h.calls).toHaveLength(2);
  });

  it('never holds longer than the clamp', async () => {
    const h = harness(waitFor(2 * 3_600 * SECOND), sent);
    await h.run();
    expect(h.sleeps.map((s) => s.ms)).toEqual([HOLD_MS]);
  });

  it('holds again while short waits fit before the deadline', async () => {
    const h = harness(waitFor(60 * SECOND), waitFor(60 * SECOND, 'wait.window'), sent);
    expect(await h.run()).toMatchObject({ status: 'completed' });
    expect(h.sleeps.map((s) => s.ms)).toEqual([60 * SECOND, 60 * SECOND]);
  });

  it('burns one retry when a second wait would end past the deadline (fetch + 1,140 s)', async () => {
    const h = harness(waitFor(HOLD_MS), waitFor(HOLD_MS));
    expect(await h.run()).toMatchObject({ status: 'failed', output: { code: 'deferred' } });
    expect(h.sleeps.map((s) => s.ms)).toEqual([HOLD_MS]);
    expect(h.calls).toHaveLength(2);
  });

  it('starts no handler call once the worker is shutting down', async () => {
    const h = harness(sent);
    h.shutdown.abort();
    expect(await h.run()).toMatchObject({ status: 'failed', output: { code: 'shutdown' } });
    expect(h.calls).toEqual([]);
  });

  it('ends a hold on shutdown and never calls the handler again', async () => {
    const h = harness(waitFor(HOLD_MS), sent);
    h.duringSleep(() => h.shutdown.abort());
    expect(await h.run()).toMatchObject({ status: 'failed', output: { code: 'shutdown' } });
    expect(h.calls).toHaveLength(1);
    expect(h.sleeps[0]?.signal.aborted).toBe(true);
  });

  it('holds nothing when the shutdown came during the handler call that asked for a wait', async () => {
    const h = harness((self) => {
      self.shutdown.abort();
      return waitFor(HOLD_MS)(self);
    }, sent);
    expect(await h.run()).toMatchObject({ status: 'failed', output: { code: 'shutdown' } });
    expect(h.sleeps).toEqual([]);
    expect(h.calls).toHaveLength(1);
  });

  it("ends a hold when pg-boss aborts the job's own signal too", async () => {
    const h = harness(waitFor(HOLD_MS), sent);
    h.duringSleep(() => h.claim.abort());
    expect(await h.run()).toMatchObject({ status: 'failed', output: { code: 'aborted' } });
    expect(h.sleeps[0]?.signal.aborted).toBe(true);
    expect(h.calls).toHaveLength(1);
  });

  it('gives pg-boss only the class of a thrown error, never its text', async () => {
    class DatabaseFailure extends Error {
      override readonly name = 'DatabaseFailure';
    }
    const h = harness(new Error('mail to jana@ssps.cz failed'), new DatabaseFailure('x@y.cz'));
    const results = [await h.run(), await h.run()];
    expect(results.map((r) => [r.status, r.output])).toEqual([
      ['failed', { code: 'error.Error' }],
      ['failed', { code: 'error.DatabaseFailure' }],
    ]);
    expect(JSON.stringify([results, h.lines])).not.toContain('@');
  });

  it('replaces a code that is not a closed code', async () => {
    const h = harness({ kind: 'done', code: 'Sent to jana@ssps.cz' });
    expect(await h.run()).toMatchObject({ status: 'completed', output: { code: 'invalid.code' } });
  });

  it('logs each outcome under its fixed name with ids and the code only', async () => {
    const h = harness(waitFor(30 * SECOND), { kind: 'retry', code: 'auth.403' });
    await h.run();
    const job = {
      jobId: jobId('mail.send', KEY),
      queue: 'mail.send',
      template: 'access.approved',
      recipientId: 'r-1',
      dedupeKey: KEY,
      attempt: 1,
    };
    expect(h.lines).toMatchObject([
      { level: 'debug', msg: 'mail.waiting', ...job, code: 'wait.gate' },
      { level: 'warn', msg: 'mail.systemic', ...job, code: 'auth.403', hint: expect.any(String) },
    ]);
    expect(Object.keys(h.lines[0] ?? {}).sort()).toEqual([
      'attempt',
      'code',
      'dedupeKey',
      'jobId',
      'level',
      'msg',
      'queue',
      'recipientId',
      'service',
      'template',
      'time',
    ]);
  });
});
