import type { JobHandlers } from '@/application/ports';

import { CRON, toScheduledJobs } from './cron';
import { reviewerDigest } from './digest';
import { lateReports } from './late-reports';
import { mailPrune } from './mail-prune';
import { mailSend } from './mail-send';
import { movedNotice } from './moved-notice';
import { deadlineReminders } from './reminders';
import { reportPrompt } from './report-prompt';
import { headmasterSummary } from './summary';

export { CRON } from './cron';

/** The handler of each job: a job without one fails typecheck. */
export const JOB_HANDLERS: JobHandlers = {
  'mail.send': mailSend,
  'mail.prune': mailPrune,
  'future.report-prompt': reportPrompt,
  'reminders.deadline': deadlineReminders,
  'reviewer.digest': reviewerDigest,
  'headmaster.summary': headmasterSummary,
  'issues.moved-notice': movedNotice,
  'reports.late': lateReports,
};

/** The registry, checked and resolved once at import: an invalid entry stops the worker's boot. */
export const SCHEDULES = toScheduledJobs(CRON);
