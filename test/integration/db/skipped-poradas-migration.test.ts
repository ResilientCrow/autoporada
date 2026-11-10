import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deadline } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { addDays, parseIsoDate, parseWallTime, toIsoDate } from '@/domain/time';
import { MIGRATIONS_DIR, runMigrations } from '@/infra/migrate';

import { adminUrl, databaseUrl } from '../../support/template-db';

/**
 * Migrations 0050 and 0051 (ADR 0054 item 11): the database is built up to 0049 by a copy of the
 * migrations folder whose journal stops there (`runMigrations` has no "up to step N"), skipped
 * poradas and their content are seeded, then the rest is applied.
 */
const name = `autoporada_test_skipped_${randomBytes(4).toString('hex')}`;
const RULE = { dayOffset: -1, time: parseWallTime('18:00') } as const;
const LAST_BEFORE = 49;

type Journal = { entries: { idx: number }[] };
let partial = '';
let client: Client;

/** Mondays relative to this Monday, whatever day the suite runs on (the migration reads now()). */
let thisMonday = '';
const at = (weeks: number) => toIsoDate(addDays(parseIsoDate(thisMonday), weeks * 7));

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  return (await client.query(sql, args)).rows as T[];
}

async function admin(sql: string): Promise<void> {
  const c = new Client({ connectionString: adminUrl() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function issue(
  monday: string,
  status: 'open' | 'skipped' | 'generated',
  over: { present?: string; guests?: string; annex2?: unknown } = {},
): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO issues (monday, meeting_date, school_year, deadline_at, status, present_text, guests_text, annex2)
     VALUES ($1, $1, '2000/2001', now(), $2, $3, $4, $5) RETURNING id`,
    [
      monday,
      status,
      over.present ?? null,
      over.guests ?? null,
      over.annex2 === undefined ? null : JSON.stringify(over.annex2),
    ],
  );
  return row!.id;
}

const item = (issueId: string, title: string) =>
  q(
    `INSERT INTO issue_items (issue_id, section, position, lineage_id, persistence, title, body)
     VALUES ($1, 'pokyny', 0, gen_random_uuid(), 'standing', $2, '{"type":"doc","content":[]}')`,
    [issueId, title],
  );

const annexes = (monday: string, list: unknown[]) =>
  q(`INSERT INTO arch_annexes (monday, annexes) VALUES ($1, $2)`, [monday, JSON.stringify(list)]);

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const itemTitles = async (monday: string) =>
  (
    await q<{ title: string }>(
      `SELECT t.title FROM issue_items t JOIN issues i ON i.id = t.issue_id WHERE i.monday = $1 ORDER BY t.title`,
      [monday],
    )
  ).map((r) => r.title);

beforeAll(async () => {
  partial = mkdtempSync(join(tmpdir(), 'autoporada-migrations-'));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    cpSync(join(MIGRATIONS_DIR, file), join(partial, file));
  }
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
  const kept = { ...journal, entries: journal.entries.filter((e) => e.idx <= LAST_BEFORE) };
  cpSync(join(MIGRATIONS_DIR, 'meta'), join(partial, 'meta'), { recursive: true });
  writeFileSync(join(partial, 'meta/_journal.json'), JSON.stringify(kept));

  await admin(`CREATE DATABASE ${name}`);
  await runMigrations(databaseUrl(name), partial);
  client = new Client({ connectionString: databaseUrl(name) });
  await client.connect();

  [{ monday: thisMonday }] = (await q<{ monday: string }>(
    `SELECT (date_trunc('week', now() AT TIME ZONE 'Europe/Prague')::date)::text AS monday`,
  )) as [{ monday: string }];
  await q(
    `INSERT INTO settings (key, value) VALUES ('deadline', '{"dayOffset":-1,"time":"18:00"}')`,
  );

  // A past skipped porada whose heir is a generated one: its content only goes.
  const past = await issue(at(-4), 'skipped', { present: 'minulá' });
  await item(past, 'past');
  await issue(at(-3), 'generated', { present: 'vydaná' });
  // A run of two skipped poradas ahead of an open heir that has an outline of its own.
  const s1 = await issue(at(1), 'skipped', { present: 'P1', guests: 'G1' });
  const s2 = await issue(at(2), 'skipped', { present: 'P2', annex2: doc('Příloha dva') });
  await item(s1, 's1');
  await item(s2, 's2');
  await annexes(at(1), [{ id: 'a1' }]);
  await annexes(at(2), [{ id: 'a2' }]);
  const heir = await issue(at(3), 'open', { guests: 'vlastní' });
  await item(heir, 'own');
  // A skipped porada whose heir has no row yet, with an outline to hand over.
  const s3 = await issue(at(5), 'skipped', { present: 'P3' });
  await item(s3, 's3');
  // A Monday that is a porada and stays one.
  await issue(at(7), 'open');

  await runMigrations(databaseUrl(name));
}, 120_000);

afterAll(async () => {
  await client?.end();
  await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  rmSync(partial, { recursive: true, force: true });
});

describe('migrations 0050 and 0051', () => {
  it('leaves no skipped issue and the enum without the value', async () => {
    expect(
      await q(`SELECT 1 FROM issues WHERE monday IN ($1, $2, $3, $4)`, [
        at(-4),
        at(1),
        at(2),
        at(5),
      ]),
    ).toEqual([]);
    const [labels] = await q<{ labels: string[] }>(
      `SELECT array_agg(enumlabel::text ORDER BY enumsortorder) AS labels FROM pg_enum WHERE enumtypid = 'issue_status'::regtype`,
    );
    expect(labels?.labels).toEqual(['open', 'generated']);
  });

  it('moves an outline to a heir without one and deletes it where the heir has its own', async () => {
    expect(await itemTitles(at(3))).toEqual(['own']);
    expect(await itemTitles(at(6))).toEqual(['s3']);
    expect(await q(`SELECT 1 FROM issue_items WHERE title IN ('s1', 's2', 'past')`)).toEqual([]);
  });

  it('fills only the texts the heir has not written, the latest skipped porada first', async () => {
    const [h] = await q(
      `SELECT present_text, guests_text, annex2, version FROM issues WHERE monday = $1`,
      [at(3)],
    );
    expect(h).toMatchObject({
      present_text: 'P2',
      guests_text: 'vlastní',
      annex2: doc('Příloha dva'),
    });
    const [c] = await q(`SELECT present_text FROM issues WHERE monday = $1`, [at(6)]);
    expect(c).toEqual({ present_text: 'P3' });
    const [g] = await q(`SELECT present_text, version FROM issues WHERE monday = $1`, [at(-3)]);
    expect(g).toEqual({ present_text: 'vydaná', version: 1 });
  });

  it('appends the Arch annexes to the heir and removes the skipped ones', async () => {
    expect(await q(`SELECT monday::text, annexes FROM arch_annexes ORDER BY monday`)).toEqual([
      { monday: at(3), annexes: [{ id: 'a2' }, { id: 'a1' }] },
    ]);
  });

  it('creates the missing heir and fills the coming Mondays up to it, none before', async () => {
    const rows = await q<{ monday: string }>(
      `SELECT monday::text FROM issues WHERE monday >= $1 ORDER BY monday`,
      [thisMonday],
    );
    // Mondays 1, 2 and 5 were the skipped ones: they are gone, so those weeks have no porada.
    expect(rows.map((r) => r.monday)).toEqual([0, 3, 4, 6, 7].map(at));
  });

  it('names the heir of the latest coming skipped porada in the calendar setting', async () => {
    expect(await q(`SELECT value FROM settings WHERE key = 'calendar'`)).toEqual([
      { value: { plannedThrough: at(6) } },
    ]);
  });

  it('leaves one system audit row per skipped porada, dates only', async () => {
    const rows = await q<{ data: unknown; actor_id: string | null }>(
      `SELECT data, actor_id FROM audit_events WHERE action = 'issue.dropped' ORDER BY data->'meta'->>'monday'`,
    );
    expect(rows.map((r) => r.actor_id)).toEqual([null, null, null, null]);
    expect(rows.map((r) => r.data)).toEqual(
      [at(-4), at(1), at(2), at(5)].map((monday) => ({
        meta: { monday, migrated: true },
        system: 'migration:0050',
      })),
    );
  });

  it('writes the deadline and school year of every row it created as the domain does', async () => {
    const created = await q<{
      monday: string;
      meeting_date: string;
      school_year: string;
      deadline_at: Date;
    }>(
      `SELECT monday::text, meeting_date::text, school_year, deadline_at FROM issues
       WHERE monday IN ($1, $2, $3)`,
      [at(0), at(4), at(6)],
    );
    expect(created).toHaveLength(3);
    for (const row of created) {
      const day = parseIsoDate(row.monday);
      expect(row.meeting_date).toBe(row.monday);
      expect(row.school_year).toBe(schoolYear(day));
      expect(row.deadline_at.getTime()).toBe(deadline(day, RULE).getTime());
    }
  });
});

describe('migration 0050 over a calendar setting already stored', () => {
  const kept = `${name}_kept`;
  let other: Client;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${kept}`);
    await runMigrations(databaseUrl(kept), partial);
    other = new Client({ connectionString: databaseUrl(kept) });
    await other.connect();
    await other.query(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at, status)
       VALUES ($1, $1, '2000/2001', now(), 'skipped')`,
      [at(1)],
    );
    await other.query(`INSERT INTO settings (key, value) VALUES ('calendar', $1)`, [
      JSON.stringify({ plannedThrough: at(9) }),
    ]);
    await runMigrations(databaseUrl(kept));
  }, 120_000);

  afterAll(async () => {
    await other?.end();
    await admin(`DROP DATABASE IF EXISTS ${kept} WITH (FORCE)`);
  });

  it('keeps the stored value: the migration never moves the boundary back', async () => {
    const { rows } = await other.query(`SELECT value FROM settings WHERE key = 'calendar'`);
    expect(rows).toEqual([{ value: { plannedThrough: at(9) } }]);
  });
});

/** The expressions of 0050, run on fixed dates around the clock changes and the school year's start. */
describe('the SQL of 0050 against the domain', () => {
  const DAYS = [
    '2026-03-23',
    '2026-03-30',
    '2026-08-31',
    '2026-09-07',
    '2026-10-26',
    '2027-03-29',
    '2027-08-30',
  ];
  it.each(DAYS)('gives the deadline and the school year of %s', async (monday) => {
    const [row] = await q<{ at: Date; year: string }>(
      `SELECT (((d + $2::int) + $3::time) AT TIME ZONE 'Europe/Prague') AS at,
              CASE WHEN extract(month FROM d) >= 9
                   THEN extract(year FROM d)::int || '/' || (extract(year FROM d)::int + 1)
                   ELSE (extract(year FROM d)::int - 1) || '/' || extract(year FROM d)::int END AS year
       FROM (SELECT $1::date AS d) s`,
      [monday, RULE.dayOffset, '18:00'],
    );
    const day = parseIsoDate(monday);
    expect(row?.at.getTime()).toBe(deadline(day, RULE).getTime());
    expect(row?.year).toBe(schoolYear(day));
  });
});
