import type { JobHandlers } from '@/application/ports';

import { CRON, toScheduledJobs } from './cron';
import { mailPrune } from './mail-prune';

export { CRON } from './cron';

/**
 * The handler of each job. `mail.send`'s handler joins in its own commit; until then the
 * type names only the handlers that exist, and no composition root consumes this yet.
 */
export const JOB_HANDLERS: Pick<JobHandlers, 'mail.prune'> = { 'mail.prune': mailPrune };

/** The registry, checked and resolved once at import: an invalid entry stops the worker's boot. */
export const SCHEDULES = toScheduledJobs(CRON);
