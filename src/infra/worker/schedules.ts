import type { PgBoss } from 'pg-boss';

import type { ScheduledJob } from '@/application/ports';
import type { Logger } from '@/infra/log';

/** Every schedule runs in the school's wall time; the registry never names a zone. */
const ZONE = 'Europe/Prague';

const pragueTime = (instant: Date) => instant.toLocaleString('sv-SE', { timeZone: ZONE });

/**
 * Makes pg-boss's schedules match the registry: each entry is upserted on (job, key), then
 * every schedule the registry no longer lists is removed, so a dropped entry stops firing.
 */
export async function syncSchedules(
  boss: PgBoss,
  schedules: readonly ScheduledJob[],
  log: Logger,
): Promise<void> {
  for (const { job, key, cron, data, missed } of schedules) {
    await boss.schedule(job, cron, data, { tz: ZONE, key, missed });
    const next = boss
      .previewSchedule(cron, { tz: ZONE, count: 3 })
      .map((run) => ({ utc: run.toISOString(), prague: pragueTime(run) }));
    log.info({ job, key, cron, next }, 'cron.registered');
  }
  const listed = new Set(schedules.map(({ job, key }) => `${job}\0${key}`));
  for (const { name, key } of await boss.getSchedules()) {
    if (!listed.has(`${name}\0${key}`)) await boss.unschedule(name, key);
  }
}
