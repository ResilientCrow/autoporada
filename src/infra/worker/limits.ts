import { JOB_TX_TIMEOUT_MS, type JobName } from '@/application/ports';
import { QUEUES } from '@/infra/jobs';
import { SEND_BUDGET_MS } from '@/infra/mail';

/** One claim, one send, one settle: the longest a single handler call works. */
export const CALL_MS = JOB_TX_TIMEOUT_MS + SEND_BUDGET_MS + JOB_TX_TIMEOUT_MS;

/** Slack between the last settle and pg-boss's expiry of the job. */
const DEADLINE_MARGIN_MS = 30_000;

/** The longest single hold: the Retry-After clamp, so one honoured answer never burns a retry. */
export const HOLD_MS = 900_000;

/**
 * `boss.stop({ graceful: true, timeout })`: a call in flight finishes inside it. The worker's
 * `stop_grace_period` in deploy/compose.yaml must exceed it by 10 s; scripts/check-compose.mjs
 * reads this line and limits.test.ts reads compose.yaml.
 */
export const STOP_TIMEOUT_MS = 35_000;

/**
 * How long after its fetch a job may still start a hold or a handler call: the queue's
 * expiry from the production spec, less one call and the margin (1,140 s for mail.send).
 * A test's shorter queue timing never shortens it.
 */
export function executionBudgetMs(queue: JobName): number {
  const expireInSeconds = QUEUES.find((spec) => spec.name === queue)?.options.expireInSeconds;
  if (expireInSeconds === undefined) throw new Error(`no expiry for queue ${queue}`);
  return expireInSeconds * 1_000 - CALL_MS - DEADLINE_MARGIN_MS;
}
