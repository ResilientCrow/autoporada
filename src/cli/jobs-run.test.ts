import { describe, expect, it } from 'vitest';

import type { ScheduledJob } from '@/application/ports';
import { SCHEDULES } from '@/application/jobs';

import type { JobsAdmin } from './jobs';
import { JOBS_RUN_USAGE, jobsRun } from './jobs-run';

const entry = (job: ScheduledJob['job'], key: string): ScheduledJob => ({
  job,
  key,
  cron: '0 7 * * *',
  data: {},
  missed: 'skip',
});

const REGISTRY = [
  entry('mail.prune', 'daily'),
  entry('reviewer.digest', 'morning'),
  entry('reviewer.digest', 'afternoon'),
];

const NOW = new Date('2026-10-31T09:15:42.123Z');
const SAME_MINUTE = new Date('2026-10-31T09:15:03.000Z');
const NEXT_MINUTE = new Date('2026-10-31T09:16:00.000Z');

/** An admin whose `send` behaves like the queue: a key already sent for a job is a duplicate. */
function fakeAdmin() {
  const sent: { job: string; data: object; dedupeKey: string }[] = [];
  const admin = {
    deadQueue: 'dead',
    counts: () => Promise.resolve([]),
    deadJobs: () => Promise.resolve([]),
    redrive: () => Promise.resolve(0),
    send(job, data, dedupeKey) {
      const duplicate = sent.some((s) => s.job === job && s.dedupeKey === dedupeKey);
      if (!duplicate) sent.push({ job, data, dedupeKey });
      return Promise.resolve(!duplicate);
    },
  } satisfies JobsAdmin;
  return { admin, sent };
}

const run = (admin: JobsAdmin, args: string[], now = NOW) =>
  jobsRun(admin, args, { schedules: REGISTRY, now });

describe('jobs:run', () => {
  it('sends the registered entry once, now, keyed by its key and the minute', async () => {
    const { admin, sent } = fakeAdmin();
    expect(await run(admin, ['reviewer.digest', 'morning'])).toEqual([
      'Queued reviewer.digest morning.',
    ]);
    expect(sent).toEqual([
      { job: 'reviewer.digest', data: {}, dedupeKey: 'morning:2026-10-31T09:15' },
    ]);
  });

  it('takes the only key of a job when none is given', async () => {
    const { admin, sent } = fakeAdmin();
    expect(await run(admin, ['mail.prune'])).toEqual(['Queued mail.prune daily.']);
    expect(sent.map((s) => s.dedupeKey)).toEqual(['daily:2026-10-31T09:15']);
  });

  it('says so and sends nothing new when the same run was queued in the same minute', async () => {
    const { admin, sent } = fakeAdmin();
    await run(admin, ['mail.prune']);
    expect(await run(admin, ['mail.prune', 'daily'], SAME_MINUTE)).toEqual([
      'Already queued mail.prune daily for this minute.',
    ]);
    expect(sent).toHaveLength(1);
  });

  it('queues the run again in the next minute, and a different key in the same minute', async () => {
    const { admin, sent } = fakeAdmin();
    await run(admin, ['reviewer.digest', 'morning']);
    await run(admin, ['reviewer.digest', 'morning'], NEXT_MINUTE);
    await run(admin, ['reviewer.digest', 'afternoon']);
    expect(sent.map((s) => s.dedupeKey)).toEqual([
      'morning:2026-10-31T09:15',
      'morning:2026-10-31T09:16',
      'afternoon:2026-10-31T09:15',
    ]);
  });

  it('reads the minute in UTC, whatever the host zone', async () => {
    const { admin, sent } = fakeAdmin();
    await run(admin, ['mail.prune'], new Date('2026-03-29T00:59:59.999Z'));
    expect(sent.map((s) => s.dedupeKey)).toEqual(['daily:2026-03-29T00:59']);
  });

  it('asks for the key when a job has several, and names them', async () => {
    const { admin, sent } = fakeAdmin();
    await expect(run(admin, ['reviewer.digest'])).rejects.toThrow('morning, afternoon');
    expect(sent).toEqual([]);
  });

  it.each([
    ['no arguments', []],
    ['an unknown job', ['mail.send']],
    ['a job that is not one at all', ['nope']],
    ['an unknown key', ['reviewer.digest', 'evening']],
    ['a key of another job', ['mail.prune', 'morning']],
    ['an extra argument', ['mail.prune', 'daily', 'now']],
    ['a flag', ['mail.prune', '--force']],
  ])('refuses %s and sends nothing', async (_why, args) => {
    const { admin, sent } = fakeAdmin();
    await expect(run(admin, args)).rejects.toThrow(JOBS_RUN_USAGE);
    expect(sent).toEqual([]);
  });

  it('does not echo what the operator typed', async () => {
    const { admin } = fakeAdmin();
    await expect(run(admin, ['a@b.cz'])).rejects.not.toThrow('a@b.cz');
  });

  it('knows every job the real registry schedules, each under its own key', async () => {
    const { admin, sent } = fakeAdmin();
    for (const { job, key } of SCHEDULES) {
      await jobsRun(admin, [job, key], { schedules: SCHEDULES, now: NOW });
    }
    expect(sent).toHaveLength(SCHEDULES.length);
    expect(new Set(sent.map((s) => s.job))).toEqual(new Set(SCHEDULES.map((s) => s.job)));
  });
});
