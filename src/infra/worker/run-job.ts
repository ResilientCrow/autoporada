import {
  isOutcomeCode,
  type JobCatalog,
  type JobHandler,
  type JobName,
  type JobOutcome,
  type OutcomeCode,
  type WorkerDeps,
} from '@/application/ports';
import { jobId } from '@/infra/jobs';
import type { Logger } from '@/infra/log';

import { executionBudgetMs, HOLD_MS } from './limits';
import { logLineFor } from './log-names';

/** A job as pg-boss fetched it, with the fields the runner reads. */
export interface FetchedJob<N extends JobName> {
  readonly id: string;
  readonly name: N;
  readonly data: JobCatalog[N];
  readonly retryCount: number;
  readonly singletonKey: string | null;
  /** pg-boss's own signal: a lost claim, or the stop timeout ran out. */
  readonly signal: AbortSignal;
}

/**
 * What pg-boss stores for a job (`perJobResults`): a status and `{ code }`, never an
 * error's message or stack, which it would otherwise keep verbatim in the job and in
 * its dead-letter copy.
 */
export interface JobResult {
  readonly id: string;
  readonly status: 'completed' | 'failed' | 'deadletter';
  readonly output: { readonly code: OutcomeCode };
}

/** Waits `ms`, or less if `signal` aborts first; never rejects. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export interface RunContext {
  readonly deps: WorkerDeps;
  readonly sleep: Sleep;
  /** Aborted on SIGTERM: ends a hold, and no handler call starts after it. */
  readonly shutdown: AbortSignal;
  readonly log: Logger;
}

const STATUS = { done: 'completed', retry: 'failed', dead: 'deadletter' } as const;

/** A thrown error becomes `error.<class>`: its text may hold an address or SQL parameters. */
function thrownOutcome(error: unknown): JobOutcome {
  const code = `error.${error instanceof Error ? error.name : typeof error}`;
  return { kind: 'retry', code: isOutcomeCode(code) ? code : 'error.unknown' };
}

/** Holds the handler to the closed code set and a real instant. */
function checked(outcome: JobOutcome): JobOutcome {
  if (!isOutcomeCode(outcome.code)) return { ...outcome, code: 'invalid.code' };
  if (outcome.kind === 'wait' && Number.isNaN(outcome.until.getTime())) {
    return { kind: 'retry', code: 'invalid.until' };
  }
  return outcome;
}

/** A string field of a payload, if it has one. */
const field = (data: object, key: string): string | undefined => {
  const value: unknown = Object.hasOwn(data, key) ? Reflect.get(data, key) : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** The ids a job line may carry; its payload holds ids only. */
function jobFields<N extends JobName>(job: FetchedJob<N>) {
  return {
    jobId: job.id,
    queue: job.name,
    template: field(job.data, 'template'),
    recipientId: field(job.data, 'recipientId'),
    dedupeKey: job.singletonKey,
    attempt: job.retryCount + 1,
  };
}

/**
 * Runs one fetched job to a result pg-boss can store. A `wait` holds here, up to
 * HOLD_MS at a time, then asks the handler again; a hold that would end past the
 * execution deadline (fetch + the production expiry, less one call) is not started and
 * costs one retry instead. Never throws.
 */
export async function runJob<N extends JobName>(
  job: FetchedJob<N>,
  handler: JobHandler<N>,
  { deps, sleep, shutdown, log }: RunContext,
): Promise<JobResult> {
  const { clock } = deps;
  const deadline = clock.now().getTime() + executionBudgetMs(job.name);
  // job.signal alone aborts only when the stop timeout has run out (spike SP5).
  const stop = AbortSignal.any([job.signal, shutdown]);
  const fields = jobFields(job);
  const input = {
    id: job.id,
    data: job.data,
    attempt: job.retryCount + 1,
    dedupeKey: job.singletonKey,
    redriven: job.singletonKey !== null && job.id !== jobId(job.name, job.singletonKey),
  };
  const report = (outcome: JobOutcome): JobOutcome => {
    const { name, level, hint } = logLineFor(outcome);
    log[level]({ ...fields, code: outcome.code, ...(hint && { hint }) }, name);
    return outcome;
  };
  const settle = (outcome: JobOutcome): JobResult => ({
    id: job.id,
    status: outcome.kind === 'wait' ? 'failed' : STATUS[outcome.kind],
    output: { code: outcome.code },
  });

  for (;;) {
    if (stop.aborted) {
      return settle(report({ kind: 'retry', code: shutdown.aborted ? 'shutdown' : 'aborted' }));
    }
    const call = Promise.resolve().then(() => handler(deps, input));
    const outcome = report(checked(await call.catch(thrownOutcome)));
    if (outcome.kind !== 'wait') return settle(outcome);
    const now = clock.now().getTime();
    const hold = Math.min(Math.max(0, outcome.until.getTime() - now), HOLD_MS);
    if (now + hold > deadline) return settle(report({ kind: 'retry', code: 'deferred' }));
    await sleep(hold, stop);
  }
}
