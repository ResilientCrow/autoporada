import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { submitMonday, type DeadlineRule } from '@/domain/calendar';
import { addDays, parseIsoDate, parseWallTime, toIsoDate, wallClockToInstant } from '@/domain/time';
import { MIGRATIONS_DIR } from '@/infra/migrate';

import { setupTestDatabase } from '../../support/database';

/**
 * Migration 0027 gives every handed-in point the Monday it was handed in for. The rule it
 * hard-codes is the one every issue was frozen under until M9 changes the default (ADR 0029),
 * so the test pins its own copy: a later change of DEFAULT_DEADLINE cannot touch it.
 */
const LEGACY_RULE: DeadlineRule = { dayOffset: -1, time: parseWallTime('18:00') };
const MIGRATION = readFileSync(join(MIGRATIONS_DIR, '0027_hand_in_backfill.sql'), 'utf8');

const database = setupTestDatabase();
let authorId = '';
let typeId = '';

beforeAll(async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
  );
  const [type] = await database.owner<{ id: string }>(
    `SELECT id FROM point_types WHERE name = 'Seminář'`,
  );
  authorId = user!.id;
  typeId = type!.id;
});

// The template has the CHECK that migration 0027 adds last; the points below are what it found.
beforeEach(() =>
  database.owner(`
    DELETE FROM points;
    DELETE FROM issues;
    ALTER TABLE points DROP CONSTRAINT IF EXISTS points_hand_in_set;`),
);

/** A draft report handed in at `at` before the backfill: the state a deployed database is in. */
async function handedIn(at: Date): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO points (kind, author_id, client_ref, type_id, body, submitted_at)
     VALUES ('report', $1, $2, $3, '{"type":"doc","content":[]}', $4) RETURNING id`,
    [authorId, randomUUID(), typeId, at],
  );
  return row!.id;
}

/** Runs the migration file, whole, in one implicit transaction. */
const migrate = () => database.owner(MIGRATION);

const handInOf = async (id: string) =>
  (
    await database.owner<{ hand_in_monday: string }>(
      `SELECT hand_in_monday::text FROM points WHERE id = $1`,
      [id],
    )
  )[0]?.hand_in_monday;

describe('the hand-in Monday backfill (migration 0027)', () => {
  // Sundays of the clock changes (2026-03-29 and 2027-03-28 forward, 2026-10-25 back) and a plain one.
  it.each(['2026-03-29', '2026-10-25', '2027-03-28', '2026-11-01'])(
    'agrees with submitMonday under the Sunday 18.00 rule around %s',
    async (sunday) => {
      const monday = addDays(parseIsoDate(sunday), 1);
      const close = wallClockToInstant(parseIsoDate(sunday), parseWallTime('18:00'));
      const instants = [
        new Date(close.getTime() - 60 * 60_000),
        new Date(close.getTime() - 1000),
        close,
        new Date(close.getTime() + 1000),
        wallClockToInstant(monday, parseWallTime('00:00')),
        wallClockToInstant(addDays(monday, 3), parseWallTime('09:30')),
      ];
      const ids = await Promise.all(instants.map(handedIn));
      await migrate();
      const stored = await Promise.all(ids.map(handInOf));
      expect(stored).toEqual(instants.map((at) => toIsoDate(submitMonday(at, [], LEGACY_RULE))));
      // The edge itself: a second before 18.00 is this Monday's, 18.00 is the next one's.
      expect(stored.slice(1, 4)).toEqual([
        toIsoDate(monday),
        toIsoDate(addDays(monday, 7)),
        toIsoDate(addDays(monday, 7)),
      ]);
    },
  );

  it('leaves a point nobody handed in without a Monday, and bumps the version of the others', async () => {
    const [draft] = await database.owner<{ id: string }>(
      `INSERT INTO points (kind, author_id, client_ref, type_id, body)
       VALUES ('report', $1, $2, $3, '{"type":"doc","content":[]}') RETURNING id`,
      [authorId, randomUUID(), typeId],
    );
    const id = await handedIn(new Date('2026-10-21T08:00:00Z'));
    await migrate();
    expect(await handInOf(draft!.id)).toBeNull();
    expect(await handInOf(id)).toBe('2026-10-26');
    const [row] = await database.owner<{ version: number }>(
      `SELECT version FROM points WHERE id = $1`,
      [id],
    );
    expect(row?.version).toBe(2);
  });

  it('runs over issues frozen under the Sunday 18.00 rule, a meeting on the Monday included', async () => {
    await database.owner(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
       VALUES ('2026-10-26', '2026-10-26', '2026/2027', $1)`,
      [wallClockToInstant(parseIsoDate('2026-10-25'), LEGACY_RULE.time)],
    );
    const id = await handedIn(new Date('2026-10-21T08:00:00Z'));
    await migrate();
    expect(await handInOf(id)).toBe('2026-10-26');
  });

  describe('the guard', () => {
    const refused = async (issue: string) => {
      await database.owner(`INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
                            VALUES ${issue}`);
      const id = await handedIn(new Date('2026-10-21T08:00:00Z'));
      await expect(migrate()).rejects.toMatchObject({
        message: 'hand_in_monday backfill: an issue was frozen under another rule',
      });
      // The file is one transaction: no Monday and no CHECK stayed.
      expect(await handInOf(id)).toBeNull();
      expect(
        await database.owner(`SELECT 1 FROM pg_constraint WHERE conname = 'points_hand_in_set'`),
      ).toEqual([]);
    };

    it('raises when an issue has a deadline other than Sunday 18.00 before its Monday', () =>
      refused(`('2026-11-02', '2026-11-02', '2026/2027', '2026-10-31T19:00:00+01')`));

    // The right weekday at the wrong time: 19.00 Prague in winter and in summer.
    it.each([
      `('2026-10-26', '2026-10-26', '2026/2027', '2026-10-25T18:00:00+00')`,
      `('2026-07-06', '2026-07-06', '2026/2027', '2026-07-05T18:00:00+01')`,
    ])('raises when the deadline is Sunday 19.00: %s', (issue) => refused(issue));

    it('raises when an issue has a meeting off its Monday', () =>
      refused(`('2026-11-02', '2026-11-04', '2026/2027', '2026-11-01T17:00:00+00')`));
  });
});
