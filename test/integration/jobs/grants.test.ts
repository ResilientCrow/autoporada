import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { applyJobGrants, createBoss } from '@/infra/jobs';
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

  it('holds on each pgboss table only what a supervising, scheduling worker uses', async () => {
    // Table-level privileges, and the columns it may update where it may not update the table.
    // Every table counts, so a table a pg-boss upgrade adds shows up here (denied) until granted.
    const rows = await database.owner<{ table: string; held: string; updates: string }>(
      `SELECT DISTINCT regexp_replace(c.relname, '^queue_stats_\\d{8}$', 'queue_stats_<day>') AS table,
              array_to_string(ARRAY(
                SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
                 WHERE has_table_privilege('autoporada_worker', c.oid, p)), ' ') AS held,
              array_to_string(ARRAY(
                SELECT a.attname FROM pg_attribute a
                 WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                   AND NOT has_table_privilege('autoporada_worker', c.oid, 'UPDATE')
                   AND has_column_privilege('autoporada_worker', c.oid, a.attnum, 'UPDATE')
                 ORDER BY a.attname), ' ') AS updates
         FROM pg_class c
        WHERE c.relnamespace = 'pgboss'::regnamespace AND c.relkind IN ('r', 'p')
        ORDER BY 1`,
    );
    const DML = 'SELECT INSERT UPDATE DELETE';
    const none = { held: '', updates: '' };
    expect(Object.fromEntries(rows.map(({ table, ...rest }) => [table, rest]))).toEqual({
      bam: none,
      instance: { held: 'SELECT DELETE', updates: 'stopped_on' },
      job: { held: DML, updates: '' },
      job_common: { held: DML, updates: '' },
      job_dependency: { held: 'SELECT DELETE', updates: '' },
      queue: {
        held: 'SELECT INSERT',
        updates: [
          'active_count',
          'blocked_count',
          'deferred_count',
          'failed_count',
          'maintain_on',
          'monitor_claim_on',
          'monitor_on',
          'queued_count',
          'ready_count',
          'ready_history',
          'retained_count',
          'retained_on',
          'singletons_active',
          'total_count',
        ].join(' '),
      },
      queue_stats: none,
      'queue_stats_<day>': none,
      schedule: { held: DML, updates: '' },
      subscription: none,
      version: { held: 'SELECT', updates: 'cron_on flow_on monitor_backoff_on' },
      warning: none,
    });
  });

  // pg-boss runs pgboss.bam's `command` as SQL in the next owner-run migrate (security-1).
  describe.each(['autoporada_worker', 'autoporada_jobs'])('%s on pgboss.bam', (role) => {
    it.each([
      [
        'plant a command',
        `INSERT INTO pgboss.bam (name, version, status, table_name, command)
         VALUES ('planted', 1, 'pending', 'job_common', 'GRANT UPDATE ON public.users TO autoporada_jobs')`,
      ],
      ['rewrite a command', `UPDATE pgboss.bam SET command = 'SELECT 1', status = 'pending'`],
      ['delete a row', `DELETE FROM pgboss.bam`],
      ['read it', `SELECT count(*) FROM pgboss.bam`],
    ])('cannot %s', async (_what, statement) => {
      expect(await sqlstateAs(role, statement)).toBe(DENIED);
    });
  });

  it.each([
    ['set the schema version', `UPDATE pgboss.version SET version = version - 1`],
    ['stamp the bam poll', `UPDATE pgboss.version SET bam_on = now()`],
    ['point a queue at another table', `UPDATE pgboss.queue SET table_name = 'bam'`],
    ['partition a queue', `UPDATE pgboss.queue SET partition = true`],
    ['rename a queue', `UPDATE pgboss.queue SET name = name || 'x'`],
    ['change a queue setting', `UPDATE pgboss.queue SET retry_limit = 0`],
    ['write a warning', `INSERT INTO pgboss.warning (type, message) VALUES ('x', 'x')`],
    ['subscribe', `INSERT INTO pgboss.subscription (event, name) VALUES ('x', 'mail.send')`],
  ])('the worker cannot %s', async (_what, statement) => {
    expect(await sqlstateAs('autoporada_worker', statement)).toBe(DENIED);
  });

  it('stamps the clock and the sweep columns of version', async () => {
    expect(
      await sqlstateAs(
        'autoporada_worker',
        `UPDATE pgboss.version SET cron_on = now(), flow_on = now(), monitor_backoff_on = NULL`,
      ),
    ).toBeUndefined();
  });

  it('gets nothing on a table the owner adds to pgboss later', async () => {
    await database.owner(`CREATE TABLE pgboss.added_later (id int)`);
    try {
      expect(await sqlstateAs('autoporada_worker', `SELECT * FROM pgboss.added_later`)).toBe(
        DENIED,
      );
    } finally {
      await database.owner(`DROP TABLE pgboss.added_later`);
    }
    expect(
      await database.owner(
        `SELECT defaclrole::regrole::text FROM pg_default_acl WHERE defaclnamespace = 'pgboss'::regnamespace`,
      ),
    ).toEqual([]);
  });

  it('takes back the blanket grant of a volume migrated before this fix', async () => {
    await database.owner(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO autoporada_jobs;
       ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoporada_jobs`,
    );
    const owner = new Client({ connectionString: databaseUrl(database.name) });
    await owner.connect();
    try {
      await applyJobGrants(owner);
    } finally {
      await owner.end();
    }
    expect(await sqlstateAs('autoporada_worker', `DELETE FROM pgboss.bam`)).toBe(DENIED);
    expect(await sqlstateAs('autoporada_worker', `UPDATE pgboss.version SET version = 1`)).toBe(
      DENIED,
    );
    expect(
      await database.owner(
        `SELECT 1 FROM pg_default_acl WHERE defaclnamespace = 'pgboss'::regnamespace`,
      ),
    ).toEqual([]);
  });

  it('creates nothing and owns nothing', async () => {
    const [facts] = await database.owner<Record<string, boolean | number>>(
      `SELECT has_schema_privilege('autoporada_worker', 'pgboss', 'CREATE') AS create_pgboss,
              has_schema_privilege('autoporada_worker', 'public', 'CREATE') AS create_public,
              (SELECT count(*)::int FROM pg_class WHERE relowner = 'autoporada_worker'::regrole) AS owns`,
    );
    expect(facts).toEqual({
      create_pgboss: false,
      create_public: false,
      owns: 0,
    });
    expect(await sqlstateAs('autoporada_worker', `DROP TABLE pgboss.job_common`)).toBe('42501');
    expect(await sqlstateAs('autoporada_worker', `CREATE TABLE pgboss.intruder (id int)`)).toBe(
      DENIED,
    );
  });

  it('reads users and access_requests, keeps the mail tables, and touches nothing else in public', async () => {
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
    expect(readable).toEqual([
      'access_requests',
      'mail_gate',
      'mail_ledger',
      'pdf_sources',
      'users',
    ]);
    const writable = rows.filter((row) => row.write).map((row) => row.table);
    expect(writable).toEqual(['mail_gate', 'mail_ledger', 'pdf_sources']);
    expect(await sqlstateAs('autoporada_worker', `SELECT count(*) FROM users`)).toBeUndefined();
    expect(await sqlstateAs('autoporada_worker', `SELECT count(*) FROM sessions`)).toBe(DENIED);
    expect(await sqlstateAs('autoporada_worker', `INSERT INTO audit_events DEFAULT VALUES`)).toBe(
      DENIED,
    );
  });
});

describe('the mails’ column grants (ADR 0020: the worker reads no text people wrote)', () => {
  const GRANTED: Readonly<Record<string, readonly string[]>> = {
    points: [
      ...['author_id', 'earliest_monday', 'end_date', 'event_date', 'hand_in_monday', 'id'],
      ...['kind', 'state', 'submitted_at', 'time_to', 'updated_at'],
    ],
    point_events: ['event', 'id', 'point_id', 'to_state'],
    future_items: [
      'author_id',
      'end_date',
      'expects_report',
      'id',
      'report_point_id',
      'report_state',
      'start_date',
      'state',
      'submitted_at',
      'time_to',
    ],
    issues: ['deadline_at', 'id', 'meeting_date', 'monday', 'status'],
    settings: ['key', 'value'],
    // 0037, 0039: where a document's PDF stands, and the DOCX staged for the job (not the archive's).
    generated_documents: ['id', 'pdf_status'],
    pdf_sources: ['document_id', 'docx'],
  };
  const WITHHELD: Readonly<Record<string, readonly string[]>> = {
    points: ['title', 'opening', 'body', 'bullets', 'statements', 'place', 'client_ref'],
    point_events: ['note', 'before', 'edited_fields'],
    future_items: ['title', 'responsible', 'place', 'client_ref', 'kind', 'campus', 'time_from'],
    issues: ['school_year', 'version', 'created_at', 'updated_at'],
    settings: ['version', 'updated_at'],
    generated_documents: [
      ...['docx', 'snapshot', 'pdf', 'issue_id', 'version', 'docx_sha256', 'pdf_sha256'],
      ...['generated_at', 'pdf_at', 'pdf_failure'],
    ],
  };

  /** Whether autoporada_worker holds `privilege` on each named column of `table`. */
  async function held(table: string, columns: readonly string[], privilege: string) {
    const rows = await database.owner<{ column: string; held: boolean }>(
      `SELECT c AS column, has_column_privilege('autoporada_worker', $1::regclass, c, $3) AS held
         FROM unnest($2::text[]) AS c`,
      [table, columns, privilege],
    );
    return Object.fromEntries(rows.map((row) => [row.column, row.held]));
  }

  it.each(Object.keys(GRANTED))(
    'lets the worker select exactly the granted columns of %s',
    async (table) => {
      const all = await database.owner<{ column: string }>(
        `SELECT column_name AS column FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY 1`,
        [table],
      );
      const facts = await held(
        table,
        all.map((row) => row.column),
        'SELECT',
      );
      const readable = Object.keys(facts).filter((column) => facts[column]);
      expect(readable).toEqual(GRANTED[table]);
    },
  );

  it.each(Object.keys(WITHHELD))('keeps what people wrote in %s out of reach', async (table) => {
    const facts = await held(table, WITHHELD[table]!, 'SELECT');
    expect(facts).toEqual(Object.fromEntries(WITHHELD[table]!.map((column) => [column, false])));
    const [first] = WITHHELD[table]!;
    expect(await sqlstateAs('autoporada_worker', `SELECT ${first} FROM ${table}`)).toBe(DENIED);
    expect(await sqlstateAs('autoporada_worker', `SELECT * FROM ${table}`)).toBe(DENIED);
  });

  // Migration 0031: the names of the school's people are no business of any job. `issue_items`
  // holds the agenda's text, which carries names too (M9 review, Security 6).
  it.each(['registry_lists', 'registry_entries', 'issue_items'])(
    'gives the worker no privilege at all on %s',
    async (table) => {
      const [row] = await database.owner<{ held: boolean }>(
        `SELECT has_any_column_privilege('autoporada_worker', $1::regclass, 'SELECT, INSERT, UPDATE, REFERENCES') AS held`,
        [table],
      );
      expect(row?.held).toBe(false);
      expect(await sqlstateAs('autoporada_worker', `SELECT * FROM ${table}`)).toBe(DENIED);
    },
  );

  // The statements the settings repository runs: `value` is all the worker's reads need, `get` also
  // selects the version, which only the headmaster's screen and save may.
  it('lets the worker run the repository’s value read of a setting, and refuses its get', async () => {
    const value = `SELECT "value" FROM "settings" WHERE "settings"."key" = 'deadline'`;
    const get = `SELECT "value", "version" FROM "settings" WHERE "settings"."key" = 'deadline'`;
    expect(await sqlstateAs('autoporada_worker', value)).toBeUndefined();
    expect(await sqlstateAs('autoporada_worker', get)).toBe(DENIED);
    expect(await sqlstateAs('autoporada_app', get)).toBeUndefined();
  });

  // generated_documents is the one table the worker also writes: its own test follows.
  it.each(Object.keys(GRANTED).filter((table) => table !== 'generated_documents'))(
    'reads the granted columns of %s and writes none',
    async (table) => {
      const columns = GRANTED[table]!;
      expect(
        await sqlstateAs('autoporada_worker', `SELECT ${columns.join(', ')} FROM ${table}`),
      ).toBeUndefined();
      for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
        expect(Object.values(await held(table, columns, privilege))).not.toContain(true);
      }
    },
  );
});

describe('the mail ledger and gate (ADR 0016: only the worker writes delivery state)', () => {
  const MAIL_TABLES = ['mail_ledger', 'mail_gate'];
  const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

  /** The privileges `role` holds on `table`, in the order of PRIVILEGES. */
  async function privilegesOf(role: string, table: string): Promise<string[]> {
    const [row] = await database.owner<{ held: string[] }>(
      `SELECT array_agg(p ORDER BY o) FILTER (WHERE has_table_privilege($1, $2::regclass, p)) AS held
         FROM unnest($3::text[]) WITH ORDINALITY AS t(p, o)`,
      [role, table, PRIVILEGES],
    );
    return row?.held ?? [];
  }

  /** A user to point ledger rows at, inserted as the owner. */
  async function seedUser(): Promise<string> {
    const [user] = await database.owner<{ id: string }>(
      `INSERT INTO users (tid, oid, display_name)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
    );
    return user!.id;
  }

  const ledgerRow = (recipientId: string, key: string, state = 'sent', code = 'sent') =>
    `INSERT INTO mail_ledger (dedupe_key, template, recipient_id, subject_id, state, code)
     VALUES ('${key}', 'access.approved', '${recipientId}', gen_random_uuid(), '${state}', '${code}')`;

  it.each(MAIL_TABLES)(
    'gives %s to the worker group (DML) and the backup (read) only',
    async (table) => {
      expect(await privilegesOf('autoporada_app', table)).toEqual([]);
      expect(await privilegesOf('autoporada_jobs', table)).toEqual([
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
      ]);
      expect(await privilegesOf('autoporada_worker', table)).toEqual([
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
      ]);
      expect(await privilegesOf('autoporada_backup', table)).toEqual(['SELECT']);
    },
  );

  it.each([
    ['read the ledger', `SELECT count(*) FROM mail_ledger`],
    ['write the ledger', `INSERT INTO mail_ledger (dedupe_key) VALUES ('x')`],
    ['change the ledger', `UPDATE mail_ledger SET state = 'sent'`],
    ['delete from the ledger', `DELETE FROM mail_ledger`],
    ['read the gate', `SELECT not_before FROM mail_gate`],
    ['open the gate', `UPDATE mail_gate SET not_before = NULL`],
    ['delete the gate', `DELETE FROM mail_gate`],
  ])('the web cannot %s', async (_what, statement) => {
    expect(await sqlstateAs('autoporada_app', statement)).toBe(DENIED);
  });

  it('lets the worker claim, settle and purge a row, and close the gate', async () => {
    const recipient = await seedUser();
    const worker = await connectAs('autoporada_worker');
    try {
      await worker.query('BEGIN');
      await worker.query(ledgerRow(recipient, 'access.approved:w', 'sending', 'claimed'));
      await worker.query(
        `UPDATE mail_ledger SET state = 'sent', code = 'sent', settled_at = now()
          WHERE dedupe_key = 'access.approved:w'`,
      );
      await worker.query(`UPDATE mail_gate SET not_before = now(), code = 'throttled.429'`);
      const { rows } = await worker.query(`SELECT state FROM mail_ledger`);
      expect(rows).toEqual([{ state: 'sent' }]);
      expect((await worker.query(`DELETE FROM mail_ledger`)).rowCount).toBe(1);
      await worker.query('ROLLBACK');
    } finally {
      await worker.end();
    }
  });

  it('holds exactly one gate row', async () => {
    expect(await database.owner(`SELECT id, not_before, code FROM mail_gate`)).toEqual([
      { id: true, not_before: null, code: null },
    ]);
    expect(await sqlstateAs('autoporada_worker', `INSERT INTO mail_gate DEFAULT VALUES`)).toBe(
      '23505',
    );
    expect(await sqlstateAs('autoporada_worker', `INSERT INTO mail_gate (id) VALUES (false)`)).toBe(
      '23514',
    );
  });

  it.each([
    ['an unknown state', 'access.approved:s', 'lost', 'sent'],
    ['a code with free text', 'access.approved:c', 'sent', 'Mailbox full: jana@ssps.cz'],
    ['a key over 120 characters', `access.approved:${'k'.repeat(110)}`, 'sent', 'sent'],
  ])('refuses %s', async (_what, key, state, code) => {
    const recipient = await seedUser();
    expect(await sqlstateAs('autoporada_worker', ledgerRow(recipient, key, state, code))).toBe(
      '23514',
    );
  });

  it('goes with the person: the web deletes a user and the cascade removes the rows', async () => {
    const recipient = await seedUser();
    await database.owner(ledgerRow(recipient, 'access.approved:cascade'));
    const web = await connectAs('autoporada_app');
    try {
      await web.query(`DELETE FROM users WHERE id = $1`, [recipient]);
    } finally {
      await web.end();
    }
    expect(await database.owner(`SELECT dedupe_key FROM mail_ledger`)).toEqual([]);
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

describe('the generated documents’ grants (ADR 0038: the worker never reads an archived DOCX)', () => {
  const ISSUE = '01900000-0000-7000-8000-000000000001';
  const DOC = '01900000-0000-7000-8000-000000000002';
  const SHA = 'a'.repeat(64);

  /** One document with its source, made as the owner, in the way `documents.insert` does. */
  async function seedDocument(): Promise<void> {
    // The database lives for the whole file: start from nothing.
    await database.owner(`DELETE FROM generated_documents`);
    await database.owner(`DELETE FROM issues WHERE id = $1`, [ISSUE]);
    await database.owner(
      `INSERT INTO issues (id, monday, meeting_date, school_year, deadline_at)
       VALUES ($1, '2026-11-02', '2026-11-02', '2026/2027', now())`,
      [ISSUE],
    );
    await database.owner(
      `INSERT INTO generated_documents (id, issue_id, snapshot, docx, docx_sha256)
       VALUES ($1, $2, '{}', '\\x504b0304', $3)`,
      [DOC, ISSUE, SHA],
    );
    await database.owner(`INSERT INTO pdf_sources (document_id, docx) VALUES ($1, '\\x504b0304')`, [
      DOC,
    ]);
  }

  it('lets the jobs role update exactly the PDF columns of generated_documents', async () => {
    const rows = await database.owner<{ column: string }>(
      `SELECT a.attname AS column FROM pg_attribute a
        WHERE a.attrelid = 'generated_documents'::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND has_column_privilege('autoporada_jobs', a.attrelid, a.attnum, 'UPDATE')
        ORDER BY 1`,
    );
    expect(rows.map((row) => row.column)).toEqual([
      ...['pdf', 'pdf_at', 'pdf_failure', 'pdf_sha256', 'pdf_status'],
    ]);
    const [table] = await database.owner<{ held: boolean }>(
      `SELECT has_table_privilege('autoporada_jobs', 'generated_documents', 'INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS held`,
    );
    expect(table?.held).toBe(false);
  });

  it('gives the web no update on generated_documents, and insert only on pdf_sources', async () => {
    const [facts] = await database.owner<Record<string, boolean>>(
      `SELECT has_table_privilege('autoporada_app', 'generated_documents', 'UPDATE') AS update_documents,
              has_table_privilege('autoporada_app', 'generated_documents', 'TRUNCATE') AS truncate_documents,
              has_table_privilege('autoporada_app', 'pdf_sources', 'INSERT') AS insert_sources,
              has_table_privilege('autoporada_app', 'pdf_sources', 'SELECT, UPDATE, DELETE, TRUNCATE') AS other_sources`,
    );
    expect(facts).toEqual({
      update_documents: false,
      truncate_documents: false,
      insert_sources: true,
      other_sources: false,
    });
  });

  it('shows the worker the staged source and the status, and nothing of the archive', async () => {
    await seedDocument();
    const worker = await connectAs('autoporada_worker');
    try {
      const { rows } = await worker.query(
        `SELECT d.pdf_status, s.docx FROM generated_documents d
           LEFT JOIN pdf_sources s ON s.document_id = d.id WHERE d.id = $1`,
        [DOC],
      );
      expect(rows).toEqual([{ pdf_status: 'pending', docx: Buffer.from([0x50, 0x4b, 3, 4]) }]);
    } finally {
      await worker.end();
    }
    for (const column of ['docx', 'snapshot', 'pdf']) {
      expect(
        await sqlstateAs('autoporada_worker', `SELECT ${column} FROM generated_documents`),
        column,
      ).toBe(DENIED);
    }
  });

  it.each([
    [
      'make a document',
      `INSERT INTO generated_documents (issue_id, snapshot, docx, docx_sha256)
       VALUES ('${ISSUE}', '{}', '\\x00', '${SHA}')`,
    ],
    ['change the DOCX', `UPDATE generated_documents SET docx = '\\x00'`],
    ['change the snapshot', `UPDATE generated_documents SET snapshot = '{"a":1}'`],
    ['delete a document', `DELETE FROM generated_documents`],
    ['stage a source', `INSERT INTO pdf_sources (document_id, docx) VALUES ('${DOC}', '\\x00')`],
    ['change a source', `UPDATE pdf_sources SET docx = '\\x00'`],
  ])('the worker cannot %s', async (_what, statement) => {
    await seedDocument();
    expect(await sqlstateAs('autoporada_worker', statement)).toBe(DENIED);
  });

  it('lets the worker mark a pending document failed with its reason', async () => {
    await seedDocument();
    const worker = await connectAs('autoporada_worker');
    try {
      await worker.query('BEGIN');
      const settled = await worker.query(
        `UPDATE generated_documents SET pdf_status = 'failed', pdf_failure = 'unavailable'
          WHERE id = $1 AND pdf_status = 'pending' RETURNING id`,
        [DOC],
      );
      expect(settled.rowCount).toBe(1);
      await worker.query('ROLLBACK');
    } finally {
      await worker.end();
    }
  });

  it('keeps the reason out of the worker’s sight: it writes it, never reads it', async () => {
    await seedDocument();
    expect(
      await sqlstateAs('autoporada_worker', `SELECT pdf_failure FROM generated_documents`),
    ).toBe(DENIED);
  });

  it('lets the worker settle a pending document and delete its source', async () => {
    await seedDocument();
    const worker = await connectAs('autoporada_worker');
    try {
      await worker.query('BEGIN');
      const settled = await worker.query(
        `UPDATE generated_documents
            SET pdf = '\\x255044462d', pdf_sha256 = $2, pdf_status = 'ready', pdf_at = now()
          WHERE id = $1 AND pdf_status = 'pending'`,
        [DOC, SHA],
      );
      expect(settled.rowCount).toBe(1);
      expect(
        (await worker.query(`DELETE FROM pdf_sources WHERE document_id = $1`, [DOC])).rowCount,
      ).toBe(1);
      await worker.query('ROLLBACK');
    } finally {
      await worker.end();
    }
  });

  it('lets the web insert a source but not read it, and the cascade still deletes it', async () => {
    await seedDocument();
    await database.owner(`DELETE FROM pdf_sources`);
    const web = await connectAs('autoporada_app');
    try {
      await web.query(`INSERT INTO pdf_sources (document_id, docx) VALUES ($1, '\\x00')`, [DOC]);
      await expect(web.query(`SELECT docx FROM pdf_sources`)).rejects.toMatchObject({
        code: DENIED,
      });
      expect(await database.owner(`SELECT 1 FROM pdf_sources`)).toHaveLength(1);
      await web.query(`DELETE FROM generated_documents WHERE id = $1`, [DOC]);
      expect(await database.owner(`SELECT 1 FROM pdf_sources`)).toEqual([]);
    } finally {
      await web.end();
    }
  });
});
