import type { Queue } from 'pg-boss';

const DAY = 86_400;

export interface QueueSpec {
  readonly name: string;
  /** Fixed at creation: pg-boss refuses to change it afterwards. */
  readonly policy: 'standard';
  readonly options: Omit<Queue, 'name' | 'policy' | 'partition'>;
}

/**
 * Every queue and its settings; code is the source of truth, `installJobs` re-applies them on
 * each migrate. The retention numbers are the ones the privacy notice states
 * (PRIVACY_FACTS, tied by test/arch/privacy-facts.test.ts). Payloads hold ids only.
 *
 * `dead` comes first: a queue must exist before another names it as its dead-letter queue.
 */
export const QUEUES: readonly QueueSpec[] = [
  {
    name: 'dead',
    policy: 'standard',
    options: {
      retryLimit: 0,
      expireInSeconds: 300,
      retentionSeconds: 90 * DAY,
      deleteAfterSeconds: 90 * DAY,
    },
  },
  {
    name: 'mail.send',
    policy: 'standard',
    options: {
      // 30 + 60 + 120 + 240 + 480 + 10 x 900 s = at least 2.76 h, longer than an RBAC propagation
      retryLimit: 15,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 900,
      // a job may hold up to 900 s for a Retry-After or the send window
      expireInSeconds: 1200,
      retentionSeconds: 14 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: 'dead',
    },
  },
];
