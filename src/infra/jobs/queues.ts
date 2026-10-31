import type { Queue } from 'pg-boss';

import { JOB_NAMES, type JobName } from '@/application/ports';

const DAY = 86_400;

/** The dead-letter queue the operator looks at; every other queue names it as its `deadLetter`. */
export const DEAD_QUEUE = 'dead';
type QueueName = JobName | typeof DEAD_QUEUE;

interface QueueSettings {
  /** Fixed at creation: pg-boss refuses to change it afterwards. */
  readonly policy: 'standard';
  readonly options: Omit<Queue, 'name' | 'policy' | 'partition' | 'deadLetter'> & {
    readonly deadLetter?: typeof DEAD_QUEUE;
  };
}

export type QueueSpec = QueueSettings & { readonly name: QueueName };

/**
 * Every queue and its settings, keyed by name: a JobName without an entry (or an entry for a name
 * that is not one) fails to compile. Code is the source of truth, `installJobs` re-applies them on
 * each migrate. The retention numbers are the ones the privacy notice states
 * (PRIVACY_FACTS, tied by test/arch/privacy-facts.test.ts). Payloads hold ids only.
 */
export const QUEUE_SPECS = {
  [DEAD_QUEUE]: {
    policy: 'standard',
    options: {
      retryLimit: 0,
      expireInSeconds: 300,
      retentionSeconds: 90 * DAY,
      deleteAfterSeconds: 90 * DAY,
    },
  },
  'mail.send': {
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
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent by the cron registry daily; a missed run is caught up once, and a run reconciles to now.
  'mail.prune': {
    policy: 'standard',
    options: {
      retryLimit: 3,
      retryDelay: 300,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 600,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent by the cron registry daily; it enqueues the prompt mails and reconciles to today.
  'future.report-prompt': {
    policy: 'standard',
    options: {
      retryLimit: 3,
      retryDelay: 300,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 600,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent by the cron registry every 15 minutes; it enqueues the reminder mails while a slot is open.
  'reminders.deadline': {
    policy: 'standard',
    options: {
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 600,
      expireInSeconds: 300,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent by the cron registry at 07.00 and 15.00; it enqueues the digest mails of the slot.
  'reviewer.digest': {
    policy: 'standard',
    options: {
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 600,
      expireInSeconds: 300,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Enqueued by issues.move when a deadline comes earlier; it fans the moved mail out to the reminders' audience.
  'issues.moved-notice': {
    policy: 'standard',
    options: {
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 600,
      expireInSeconds: 300,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent every 15 minutes by the cron registry; it enqueues the late-report mails inside their windows.
  'reports.late': {
    policy: 'standard',
    options: {
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 600,
      expireInSeconds: 300,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
  // Sent every five minutes by the cron registry; it enqueues the summary mails inside an issue's window.
  'headmaster.summary': {
    policy: 'standard',
    options: {
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 600,
      expireInSeconds: 300,
      retentionSeconds: 2 * DAY,
      deleteAfterSeconds: 2 * DAY,
      deadLetter: DEAD_QUEUE,
    },
  },
} satisfies Record<QueueName, QueueSettings>;

/**
 * The specs as a list, in the order they are created: `dead` first, because a queue must exist
 * before another names it as its dead-letter queue.
 */
const CREATION_ORDER: readonly QueueName[] = [DEAD_QUEUE, ...JOB_NAMES];
export const QUEUES: readonly QueueSpec[] = CREATION_ORDER.map((name) => ({
  name,
  ...QUEUE_SPECS[name],
}));
