import type { JobCatalog, JobName, ScheduledJob } from '@/application/ports';

/** When a job runs, in Prague wall time; infra always passes the zone. */
export type Schedule =
  | { readonly daily: { readonly hour: number; readonly minute: number } }
  | { readonly everyMinutes: 5 | 10 | 15 | 30 };

export interface CronEntry<N extends JobName = JobName> {
  readonly job: N;
  /** Names the schedule among the job's schedules; pg-boss upserts on (job, key). */
  readonly key: string;
  readonly schedule: Schedule;
  readonly data: JobCatalog[N];
  /** After downtime: `once` sends one job for the latest missed run, `skip` none. */
  readonly catchUp: 'once' | 'skip';
}

/**
 * Every timed job. A scheduled handler reconciles the world to now from the clock and the
 * data, never from the tick, so running it twice does nothing (ADR 0015).
 */
export const CRON: readonly CronEntry[] = [
  {
    job: 'mail.prune',
    key: 'daily',
    schedule: { daily: { hour: 5, minute: 10 } },
    data: {},
    catchUp: 'once',
  },
  {
    job: 'future.report-prompt',
    key: 'daily',
    schedule: { daily: { hour: 8, minute: 0 } },
    data: {},
    catchUp: 'once',
  },
  // A missed tick is not caught up: the next one finds the slot still open, or it has passed.
  {
    job: 'reminders.deadline',
    key: 'quarter',
    schedule: { everyMinutes: 15 },
    data: {},
    catchUp: 'skip',
  },
  // A late report's mails have windows of minutes; a missed tick is found by the next while the window is open.
  {
    job: 'reports.late',
    key: 'quarter',
    schedule: { everyMinutes: 15 },
    data: {},
    catchUp: 'skip',
  },
  // 07.00 and 15.00 name the slots of the ledger key; a missed one is not made up, the next digest counts since the last sent.
  {
    job: 'reviewer.digest',
    key: 'morning',
    schedule: { daily: { hour: 7, minute: 0 } },
    data: {},
    catchUp: 'skip',
  },
  {
    job: 'reviewer.digest',
    key: 'afternoon',
    schedule: { daily: { hour: 15, minute: 0 } },
    data: {},
    catchUp: 'skip',
  },
  // The window opens five minutes after a deadline and stays two hours: a missed tick is found by the next.
  {
    job: 'headmaster.summary',
    key: 'tick',
    schedule: { everyMinutes: 5 },
    data: {},
    catchUp: 'skip',
  },
];

/** The cron string is derived, never typed: `10 5 * * *`, `*\/15 * * * *`. */
export function cronExpression(schedule: Schedule): string {
  if ('everyMinutes' in schedule) return `*/${schedule.everyMinutes} * * * *`;
  return `${schedule.daily.minute} ${schedule.daily.hour} * * *`;
}

const inRange = (value: number, max: number) =>
  Number.isInteger(value) && value >= 0 && value <= max;

function checkSchedule(schedule: Schedule): void {
  if ('everyMinutes' in schedule) return;
  const { hour, minute } = schedule.daily;
  if (!inRange(hour, 23) || !inRange(minute, 59)) {
    throw new RangeError(`cron: ${hour}:${minute} is not a time of day`);
  }
  // Prague skips 2:00-3:00 in spring and repeats it in autumn; the timekeeper then never fires
  // or fires twice, so no entry may run in that hour.
  if (hour === 2) throw new RangeError('cron: hour 2 is skipped or repeated in Prague');
}

/** Checks the entries and resolves them for infra: one schedule per (job, key). */
export function toScheduledJobs(entries: readonly CronEntry[]): readonly ScheduledJob[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    checkSchedule(entry.schedule);
    const id = `${entry.job} ${entry.key}`;
    if (seen.has(id)) throw new Error(`cron: ${id} is listed twice`);
    seen.add(id);
    return {
      job: entry.job,
      key: entry.key,
      cron: cronExpression(entry.schedule),
      data: entry.data,
      missed: entry.catchUp,
    };
  });
}
