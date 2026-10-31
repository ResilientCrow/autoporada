/**
 * `jobs:run <job> [key]` (design M8 §13): queues one run of a registered cron entry now, for the
 * operator to catch up after downtime and for the e2e to trigger the daily mail. The handler
 * reconciles to now, as it does on its schedule, so a run on top of a scheduled one does nothing twice.
 */
import type { ScheduledJob } from '@/application/ports';

import type { JobsAdmin } from './jobs';

export const JOBS_RUN_USAGE = 'jobs:run <job> [key]';

export interface JobsRunDeps {
  /** The registered cron entries (SCHEDULES). */
  readonly schedules: readonly ScheduledJob[];
  readonly now: Date;
}

/** `2026-10-31T09:15`: the UTC minute, so two runs in one minute are one job whatever the host zone. */
const minuteOf = (now: Date): string => now.toISOString().slice(0, 16);

/** What the error may say: the registry's own names, never what was typed. */
function usage(schedules: readonly ScheduledJob[]): Error {
  const jobs = [...new Set(schedules.map(({ job }) => job))].join(', ');
  return new Error(`Usage: ${JOBS_RUN_USAGE}\nJobs: ${jobs}`);
}

export async function jobsRun(
  admin: JobsAdmin,
  args: readonly string[],
  { schedules, now }: JobsRunDeps,
): Promise<string[]> {
  const [job, key, ...extra] = args;
  const ofJob = schedules.filter((entry) => entry.job === job);
  if (job === undefined || ofJob.length === 0 || extra.length > 0) {
    throw usage(schedules);
  }
  const keys = ofJob.map((entry) => entry.key);
  // a job with one schedule needs no key
  const entry =
    key === undefined
      ? ofJob.length === 1
        ? ofJob[0]
        : undefined
      : ofJob.find((e) => e.key === key);
  if (entry === undefined) {
    throw new Error(`Usage: ${JOBS_RUN_USAGE}\nKeys of ${job}: ${keys.join(', ')}`);
  }
  const queued = await admin.send(entry.job, entry.data, `${entry.key}:${minuteOf(now)}`);
  return [
    queued
      ? `Queued ${entry.job} ${entry.key}.`
      : `Already queued ${entry.job} ${entry.key} for this minute.`,
  ];
}
