import type { TemplateName } from '@/notify';

/**
 * Background jobs and their payloads. Payloads carry ids only: the queue
 * keeps its rows, and minors' data must not linger there. A new job needs an
 * entry here, a queue spec, a handler and, if it is timed, a cron line.
 */
export const JOB_NAMES = ['mail.send', 'mail.prune'] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobCatalog {
  'mail.send': {
    readonly template: TemplateName;
    readonly recipientId: string;
    readonly subjectId: string;
  };
  /** Deletes ledger rows past their retention; the cron registry sends it, never a use case. */
  'mail.prune': Readonly<Record<string, never>>;
}

export interface EnqueueOptions {
  /** At most one queued job per key. Required: every job must be safe to repeat. */
  readonly dedupeKey: string;
  readonly startAfter?: Date;
}

/** Enqueues inside the caller's transaction: a job exists only if the change commits (ADR 0006). */
export interface JobPort {
  enqueue<N extends JobName>(name: N, data: JobCatalog[N], options: EnqueueOptions): Promise<void>;
}

/** The bound on a handler's claim and settle transactions (TxOptions.transactionTimeoutMs). */
export const JOB_TX_TIMEOUT_MS = 5_000;

/** What the runner hands a handler. */
export interface JobInput<N extends JobName> {
  readonly id: string;
  readonly data: JobCatalog[N];
  /** 1 for the first run. */
  readonly attempt: number;
  readonly dedupeKey: string | null;
  /** The job was revived by an operator: its id is not the one its key derives. */
  readonly redriven: boolean;
}

/**
 * A short machine code, never free text: it is logged and stored in the
 * queue's output. `sent`, `skipped.stale`, `already.sent`, `auth.403` ...
 */
export type OutcomeCode = string;

const OUTCOME_CODE = /^[a-z]+(\.[A-Za-z0-9_-]+)*$/;
const OUTCOME_CODE_MAX = 40;

export function isOutcomeCode(code: string): boolean {
  return code.length <= OUTCOME_CODE_MAX && OUTCOME_CODE.test(code);
}

export type JobOutcome =
  /** Finished: sent, resent, skipped, already settled, purged. */
  | { readonly kind: 'done'; readonly code: OutcomeCode }
  /** Not yet: a closed gate or window. The runner holds until `until`, then asks again. */
  | { readonly kind: 'wait'; readonly until: Date; readonly code: OutcomeCode }
  /** Transient failure: the queue retries with its backoff. */
  | { readonly kind: 'retry'; readonly code: OutcomeCode }
  /** Permanent failure: straight to the dead-letter queue. */
  | { readonly kind: 'dead'; readonly code: OutcomeCode };

/** A cron entry with its schedule resolved; infra never builds a cron string. */
export interface ScheduledJob {
  readonly job: JobName;
  readonly key: string;
  readonly cron: string;
  readonly data: object;
  readonly missed: 'once' | 'skip';
}
