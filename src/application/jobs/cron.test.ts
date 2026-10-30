import { describe, expect, it } from 'vitest';

import { cronExpression, toScheduledJobs, type CronEntry } from './cron';
import { CRON, SCHEDULES } from './index';

const entry = (over: Partial<CronEntry<'mail.prune'>> = {}): CronEntry<'mail.prune'> => ({
  job: 'mail.prune',
  key: 'daily',
  schedule: { daily: { hour: 5, minute: 10 } },
  data: {},
  catchUp: 'once',
  ...over,
});

describe('cron registry', () => {
  it.each([
    [{ daily: { hour: 5, minute: 10 } }, '10 5 * * *'],
    [{ daily: { hour: 0, minute: 0 } }, '0 0 * * *'],
    [{ daily: { hour: 23, minute: 59 } }, '59 23 * * *'],
    [{ everyMinutes: 15 }, '*/15 * * * *'],
    [{ everyMinutes: 5 }, '*/5 * * * *'],
  ] as const)('derives the cron string of %o', (schedule, cron) => {
    expect(cronExpression(schedule)).toBe(cron);
  });

  it('ships mail.prune daily at 05:10 and the report prompt daily at 08:00 Prague time, each catching up once', () => {
    expect(CRON).toEqual([
      entry(),
      {
        job: 'future.report-prompt',
        key: 'daily',
        schedule: { daily: { hour: 8, minute: 0 } },
        data: {},
        catchUp: 'once',
      },
    ]);
    expect(SCHEDULES).toEqual([
      { job: 'mail.prune', key: 'daily', cron: '10 5 * * *', data: {}, missed: 'once' },
      { job: 'future.report-prompt', key: 'daily', cron: '0 8 * * *', data: {}, missed: 'once' },
    ]);
  });

  it.each([0, 30])(
    'refuses 2:%i, the Prague hour skipped in spring and repeated in autumn',
    (minute) => {
      expect(() => toScheduledJobs([entry({ schedule: { daily: { hour: 2, minute } } })])).toThrow(
        /hour 2/,
      );
    },
  );

  it.each([
    [-1, 0],
    [24, 0],
    [1.5, 0],
    [5, -1],
    [5, 60],
    [5, 0.5],
  ])('refuses %i:%i', (hour, minute) => {
    expect(() => toScheduledJobs([entry({ schedule: { daily: { hour, minute } } })])).toThrow(
      RangeError,
    );
  });

  it('refuses two entries with the same job and key, not the same key on another schedule', () => {
    expect(() => toScheduledJobs([entry(), entry()])).toThrow(/mail\.prune.*daily/);
    expect(
      toScheduledJobs([entry(), entry({ key: 'hourly', schedule: { everyMinutes: 30 } })]),
    ).toHaveLength(2);
  });
});
