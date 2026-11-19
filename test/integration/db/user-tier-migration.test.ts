import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, runMigrations } from '@/infra/migrate';

import { adminUrl, databaseUrl } from '../../support/template-db';

/**
 * Migration 0061 (ADR 0072 item 2): the database is built up to 0060 by a copy of the migrations
 * folder whose journal stops there, a student with a session and a headmaster are seeded, then the
 * rest is applied. The student flag becomes the tier and nobody is signed out by the move.
 */
const name = `autoporada_test_tier_${randomBytes(4).toString('hex')}`;
const LAST_BEFORE = 60;
const TID = '00000000-0000-0000-0000-000000000001';

type Journal = { entries: { idx: number }[] };
let partial = '';
let client: Client;
const ids = { student: '', head: '', pending: '' };

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

async function user(role: string, isStudent: boolean): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name, role, is_student) VALUES ($1, $2, 'x', $3, $4)
     RETURNING id`,
    [TID, randomUUID(), role, isStudent],
  );
  return row!.id;
}

const signIn = (userId: string) =>
  q(
    `INSERT INTO sessions (token_hash, user_id, auth_time, idle_expires_at, abs_expires_at)
     VALUES ($1, $2, now(), now() + interval '1 hour', now() + interval '2 hours')`,
    [randomBytes(32), userId],
  );

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

  ids.student = await user('submitter', true);
  ids.head = await user('headmaster', false);
  ids.pending = await user('pending', false);
  await signIn(ids.student);
  await signIn(ids.head);

  await runMigrations(databaseUrl(name));
}, 120_000);

afterAll(async () => {
  await client?.end();
  await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  rmSync(partial, { recursive: true, force: true });
});

describe('migration 0061', () => {
  it('makes a student `student` and leaves everyone else without a tier', async () => {
    const rows = await q<{ id: string; tier: string | null; role: string }>(
      `SELECT id, tier, role FROM users`,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ids.student)).toMatchObject({ tier: 'student', role: 'submitter' });
    expect(byId.get(ids.head)).toMatchObject({ tier: null, role: 'headmaster' });
    expect(byId.get(ids.pending)).toMatchObject({ tier: null, role: 'pending' });
  });

  it('signs nobody out', async () => {
    const rows = await q<{ user_id: string }>(`SELECT user_id FROM sessions ORDER BY user_id`);
    expect(rows.map((r) => r.user_id)).toEqual([ids.student, ids.head].sort());
  });

  it('drops the student flag', async () => {
    expect(
      await q(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_student'`,
      ),
    ).toEqual([]);
  });

  it('still ends the sessions of a user who becomes staff', async () => {
    await q(`UPDATE users SET tier = 'ucitel' WHERE id = $1`, [ids.student]);
    expect(await q(`SELECT 1 FROM sessions WHERE user_id = $1`, [ids.student])).toEqual([]);
  });
});
