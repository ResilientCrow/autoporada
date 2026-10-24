import type { JobHandlers } from '@/application/ports';

import { CRON, toScheduledJobs } from './cron';
import { mailPrune } from './mail-prune';
import { mailSend } from './mail-send';

export { CRON } from './cron';

/** The handler of each job: a job without one fails typecheck. */
export const JOB_HANDLERS: JobHandlers = { 'mail.send': mailSend, 'mail.prune': mailPrune };

/** The registry, checked and resolved once at import: an invalid entry stops the worker's boot. */
export const SCHEDULES = toScheduledJobs(CRON);
