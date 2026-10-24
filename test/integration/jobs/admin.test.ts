import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { jobId, withJobsAdmin } from '@/infra/jobs';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';
import { databaseUrl } from '../../support/template-db';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const SLOW = 30_000;
const DATA = { template: 'access.approved', recipientId: 'r-1', subjectId: 's-1' } as const;

/** The CLI's way in: pg-boss as the schema owner, opened and closed around one command. */
const admin = <T>(use: Parameters<typeof withJobsAdmin<T>>[1]) =>
  withJobsAdmin(databaseUrl(database.name), use);

async function started(): Promise<PgBoss> {
  const boss = jobs.boss();
  await boss.start();
  return boss;
}

/** Runs a job to its end: fetched, then completed or failed with no retry left (so dead-lettered). */
async function finish(boss: PgBoss, key: string, how: 'complete' | 'fail'): Promise<string> {
  const id = jobId('mail.send', key);
  await boss.send('mail.send', DATA, { id, singletonKey: key, retryLimit: 0 });
  await boss.fetch('mail.send');
  if (how === 'complete') await boss.complete('mail.send', id, { code: 'sent' });
  else await boss.fail('mail.send', id, { code: 'rejected.400' });
  return id;
}

const deadIdOf = async (sourceId: string): Promise<string> =>
  String(
    (
      await database.owner<{ id: string }>(`SELECT id FROM pgboss.job WHERE source_id = $1`, [
        sourceId,
      ])
    )[0]?.id,
  );

describe('the jobs admin (as the owner, the way the CLI connects)', () => {
  it(
    'counts the jobs of every queue by state, and lists queues without jobs',
    async () => {
      const boss = await started();
      await finish(boss, 'access.approved:ok', 'complete');
      await finish(boss, 'access.approved:bad', 'fail');
      const counts = await admin((a) => a.counts());
      const byQueue = Object.fromEntries(counts.map((c) => [c.queue, c.states]));
      expect(byQueue['mail.send']).toEqual({ completed: 1, failed: 1 });
      expect(byQueue['dead']).toEqual({ created: 1 });
      expect(byQueue['mail.prune']).toEqual({});
      expect(counts.map((c) => c.queue).sort()).toEqual(['dead', 'mail.prune', 'mail.send']);
    },
    SLOW,
  );

  it(
    'lists a dead job with its ids, key and code, and nothing from the payload but the template',
    async () => {
      const boss = await started();
      const source = await finish(boss, 'access.approved:bad', 'fail');
      const [job, ...others] = await admin((a) => a.deadJobs());
      expect(others).toEqual([]);
      expect(job).toEqual({
        id: await deadIdOf(source),
        sourceQueue: 'mail.send',
        template: 'access.approved',
        dedupeKey: 'access.approved:bad',
        createdAt: expect.any(Date),
        code: 'rejected.400',
      });
    },
    SLOW,
  );

  it(
    'redrives by id: a new job in the source queue with the same key, and the dead copy is gone',
    async () => {
      const boss = await started();
      const source = await finish(boss, 'access.approved:bad', 'fail');
      await finish(boss, 'access.approved:other', 'fail');
      const dead = await deadIdOf(source);

      expect(await admin((a) => a.redrive({ ids: [dead] }))).toBe(1);

      const revived = await database.owner<{ id: string; state: string; singleton_key: string }>(
        `SELECT id, state, singleton_key FROM pgboss.job WHERE name = 'mail.send' AND state = 'created'`,
      );
      expect(revived).toHaveLength(1);
      expect(revived[0]).toMatchObject({ state: 'created', singleton_key: 'access.approved:bad' });
      expect(revived[0]?.id).not.toBe(source);
      const left = await admin((a) => a.deadJobs());
      expect(left.map((j) => j.dedupeKey)).toEqual(['access.approved:other']);
    },
    SLOW,
  );

  it(
    'redrives by source queue, and an unknown id or another source moves nothing',
    async () => {
      const boss = await started();
      await finish(boss, 'access.approved:one', 'fail');
      await finish(boss, 'access.approved:two', 'fail');

      expect(await admin((a) => a.redrive({ ids: ['0e5d3a4c-6b2f-4c1e-9a77-3f0d8b1c2a64'] }))).toBe(
        0,
      );
      expect(await admin((a) => a.redrive({ source: 'mail.prune' }))).toBe(0);
      expect(await admin((a) => a.deadJobs())).toHaveLength(2);

      expect(await admin((a) => a.redrive({ source: 'mail.send' }))).toBe(2);
      expect(await admin((a) => a.deadJobs())).toEqual([]);
      const created = await database.owner(
        `SELECT 1 FROM pgboss.job WHERE name = 'mail.send' AND state = 'created'`,
      );
      expect(created).toHaveLength(2);
    },
    SLOW,
  );

  it(
    'holds a connection only while a command runs',
    async () => {
      const open = async () =>
        (
          await database.owner<{ n: number }>(
            `SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'autoporada-cli' AND datname = current_database()`,
          )
        )[0]?.n;
      expect(await admin(async () => await open())).toBeGreaterThan(0);
      expect(await open()).toBe(0);
    },
    SLOW,
  );
});
