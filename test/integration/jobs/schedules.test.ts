import { describe, expect, it } from 'vitest';

import type { ScheduledJob } from '@/application/ports';
import { syncSchedules } from '@/infra/worker';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const SLOW = 30_000;

const prune: ScheduledJob = {
  job: 'mail.prune',
  key: 'daily',
  cron: '10 5 * * *',
  data: {},
  missed: 'once',
};

/** The schedule rows as pg-boss keeps them, read as the owner. */
const rows = () =>
  database.owner<{ name: string; key: string; cron: string; timezone: string; options: object }>(
    `SELECT name, key, cron, timezone, options FROM pgboss.schedule ORDER BY name, key`,
  );

async function started() {
  const boss = jobs.boss();
  await boss.start();
  await database.owner('DELETE FROM pgboss.schedule');
  return boss;
}

describe('syncSchedules (as autoporada_worker)', () => {
  it(
    'writes one row per entry in Prague time with its catch-up rule, and logs the next runs',
    async () => {
      const boss = await started();
      await syncSchedules(boss, [prune], jobs.log);
      expect(await rows()).toEqual([
        {
          name: 'mail.prune',
          key: 'daily',
          cron: '10 5 * * *',
          timezone: 'Europe/Prague',
          options: expect.objectContaining({ tz: 'Europe/Prague', key: 'daily', missed: 'once' }),
        },
      ]);
      const line = jobs.lines.find((l) => l['msg'] === 'cron.registered');
      expect(line).toMatchObject({ job: 'mail.prune', key: 'daily', cron: '10 5 * * *' });
      expect(line?.['next']).toHaveLength(3);
      expect(line?.['next']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ prague: expect.stringMatching(/ 05:10:00$/) }),
        ]),
      );
    },
    SLOW,
  );

  it(
    'leaves one row when synced twice, and changes a row in place',
    async () => {
      const boss = await started();
      await syncSchedules(boss, [prune], jobs.log);
      await syncSchedules(boss, [prune], jobs.log);
      expect(await rows()).toHaveLength(1);
      await syncSchedules(boss, [{ ...prune, cron: '15 3 * * *' }], jobs.log);
      expect(await rows()).toMatchObject([{ key: 'daily', cron: '15 3 * * *' }]);
    },
    SLOW,
  );

  it(
    'removes a schedule the registry no longer lists',
    async () => {
      const boss = await started();
      await boss.schedule('mail.prune', '0 4 * * *', {}, { key: 'retired', tz: 'Europe/Prague' });
      await syncSchedules(boss, [prune], jobs.log);
      expect((await rows()).map((r) => r.key)).toEqual(['daily']);
    },
    SLOW,
  );
});
