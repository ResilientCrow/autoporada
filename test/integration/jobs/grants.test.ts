import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { createBoss } from '@/infra/jobs';
import { createLogger } from '@/infra/log';
import type { Logger } from '@/infra/log';

import { setupTestDatabase } from '../../support/database';
import { databaseUrl } from '../../support/template-db';

const database = setupTestDatabase();
const SLOW = 30_000;
const DENIED = '42501';

/** Lines pino wrote at warn or above, to prove a started instance reports nothing. */
function quietLog(): { log: Logger; lines: string[] } {
  const lines: string[] = [];
  const destination = {
    write(chunk: string) {
      lines.push(chunk);
    },
  };
  return { log: createLogger({ service: 'test', level: 'warn', destination }), lines };
}

/** One connection running as `role`, as the pools of the web and the worker do. */
async function connectAs(role: string): Promise<Client> {
  const client = new Client({
    connectionString: databaseUrl(database.name),
    options: `-c role=${role}`,
  });
  await client.connect();
  return client;
}

/**
 * Runs one statement as `role` in a transaction of its own, so a denial cannot poison
 * the next check, and returns the SQLSTATE it failed with (undefined if it succeeded).
 */
async function sqlstateAs(role: string, statement: string): Promise<string | undefined> {
  const client = await connectAs(role);
  try {
    await client.query('BEGIN');
    await client.query(statement);
    await client.query('ROLLBACK');
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await client.end();
  }
}

const bosses: { stop(options: object): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(bosses.splice(0).map((boss) => boss.stop({ graceful: false, close: true })));
});

function bossAs(kind: 'producer' | 'worker', role: string) {
  const { log, lines } = quietLog();
  const boss = createBoss(kind, {
    url: databaseUrl(database.name),
    applicationName: 'autoporada-grants-test',
    role,
    log,
  });
  bosses.push(boss);
  return { boss, lines };
}

describe('the web role on pgboss (autoporada_app)', () => {
  it(
    'starts a producer and sends a job',
    async () => {
      const { boss, lines } = bossAs('producer', 'autoporada_app');
      await boss.start();
      const id = await boss.send('mail.send', { recipientId: 'r', subjectId: 's' });
      expect(id).toEqual(expect.any(String));
      expect(lines).toEqual([]);
    },
    SLOW,
  );

  it(
    'reads back only the id of a job, in its own transaction',
    async () => {
      const { boss } = bossAs('producer', 'autoporada_app');
      await boss.start();
      const id = await boss.send('mail.send', { recipientId: 'r', subjectId: 's' });
      // a denied column aborts a transaction, so the allowed read is a check of its own
      const client = await connectAs('autoporada_app');
      try {
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM pgboss.job WHERE id = $1`,
          [id],
        );
        expect(rows).toEqual([{ id }]);
      } finally {
        await client.end();
      }
    },
    SLOW,
  );

  it.each([
    ['read the payload', `SELECT data FROM pgboss.job`],
    ['read the singleton key', `SELECT singleton_key FROM pgboss.job_common`],
    ['update a job', `UPDATE pgboss.job SET priority = 1`],
    ['delete a job', `DELETE FROM pgboss.job`],
    ['change a queue', `UPDATE pgboss.queue SET retry_limit = 0`],
    [
      'write a schedule',
      `INSERT INTO pgboss.schedule (name, key, cron) VALUES ('mail.send', 'x', '* * * * *')`,
    ],
    ['create a table in pgboss', `CREATE TABLE pgboss.intruder (id int)`],
    ['call create_queue', `SELECT pgboss.create_queue('intruder', '{}'::jsonb)`],
  ])('cannot %s', async (_what, statement) => {
    expect(await sqlstateAs('autoporada_app', statement)).toBe(DENIED);
  });

  it('can use the job_state type', async () => {
    expect(
      await sqlstateAs('autoporada_app', `SELECT 'created'::pgboss.job_state`),
    ).toBeUndefined();
  });
});

describe('the worker role (autoporada_worker, in autoporada_jobs only)', () => {
  it('is a member of the jobs group and not of the app group', async () => {
    const rows = await database.owner(
      `SELECT pg_has_role('autoporada_worker', 'autoporada_jobs', 'MEMBER') AS jobs,
              pg_has_role('autoporada_worker', 'autoporada_app', 'MEMBER') AS app`,
    );
    expect(rows).toEqual([{ jobs: true, app: false }]);
  });

  it(
    'runs the clock and the sweep, fills a schedule and works a job the web sent',
    async () => {
      const web = bossAs('producer', 'autoporada_app');
      await web.boss.start();
      const id = await web.boss.send('mail.send', { recipientId: 'r', subjectId: 's' });

      const { boss, lines } = bossAs('worker', 'autoporada_worker');
      await boss.start();
      const seen: string[] = [];
      await boss.work('mail.send', { pollingIntervalSeconds: 0.5 }, (jobs) => {
        seen.push(...jobs.map((job) => job.id));
        return Promise.resolve();
      });
      await boss.schedule(
        'mail.send',
        '10 5 * * *',
        {},
        { key: 'grants-test', tz: 'Europe/Prague' },
      );
      expect(await boss.getSchedules('mail.send')).toHaveLength(1);
      await boss.unschedule('mail.send', 'grants-test');
      await boss.supervise('mail.send');
      await expect.poll(() => seen, { timeout: 15_000 }).toContain(id);
      expect(lines).toEqual([]);
    },
    SLOW,
  );

  it('changes rows in every pgboss table but creates nothing and owns nothing', async () => {
    const [facts] = await database.owner<Record<string, boolean | number>>(
      `SELECT has_table_privilege('autoporada_worker', 'pgboss.job_common', 'INSERT,UPDATE,DELETE,SELECT') AS job,
              has_table_privilege('autoporada_worker', 'pgboss.queue', 'UPDATE') AS queue,
              has_table_privilege('autoporada_worker', 'pgboss.version', 'UPDATE') AS version,
              has_table_privilege('autoporada_worker', 'pgboss.schedule', 'INSERT,DELETE') AS schedule,
              has_schema_privilege('autoporada_worker', 'pgboss', 'CREATE') AS create_pgboss,
              has_schema_privilege('autoporada_worker', 'public', 'CREATE') AS create_public,
              (SELECT count(*)::int FROM pg_class WHERE relowner = 'autoporada_worker'::regrole) AS owns`,
    );
    expect(facts).toEqual({
      job: true,
      queue: true,
      version: true,
      schedule: true,
      create_pgboss: false,
      create_public: false,
      owns: 0,
    });
    expect(await sqlstateAs('autoporada_worker', `DROP TABLE pgboss.job_common`)).toBe('42501');
    expect(await sqlstateAs('autoporada_worker', `CREATE TABLE pgboss.intruder (id int)`)).toBe(
      DENIED,
    );
  });

  it('reads users and access_requests and nothing else in public', async () => {
    const rows = await database.owner<{ table: string; read: boolean; write: boolean }>(
      `SELECT c.relname AS table,
              has_table_privilege('autoporada_worker', c.oid, 'SELECT') AS read,
              has_table_privilege('autoporada_worker', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS write
         FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'S')
        ORDER BY 1`,
    );
    // every table counts, so a table added without a decision here shows up as readable
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const readable = rows.filter((row) => row.read).map((row) => row.table);
    expect(readable).toEqual(['access_requests', 'users']);
    expect(rows.filter((row) => row.write)).toEqual([]);
    expect(await sqlstateAs('autoporada_worker', `SELECT count(*) FROM users`)).toBeUndefined();
    expect(await sqlstateAs('autoporada_worker', `SELECT count(*) FROM sessions`)).toBe(DENIED);
    expect(await sqlstateAs('autoporada_worker', `INSERT INTO audit_events DEFAULT VALUES`)).toBe(
      DENIED,
    );
  });
});

describe('functions in pgboss', () => {
  it('are not SECURITY DEFINER', async () => {
    const rows = await database.owner(
      `SELECT proname FROM pg_proc WHERE pronamespace = 'pgboss'::regnamespace AND prosecdef`,
    );
    expect(rows).toEqual([]);
  });

  it('cannot be executed by PUBLIC', async () => {
    const rows = await database.owner(
      `SELECT proname FROM pg_proc p
        WHERE pronamespace = 'pgboss'::regnamespace
          AND (proacl IS NULL
               OR EXISTS (SELECT FROM aclexplode(proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))`,
    );
    expect(rows).toEqual([]);
  });
});
