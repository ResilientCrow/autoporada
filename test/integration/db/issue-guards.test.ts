import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const CHECK = '23514';

/** Inserts an issue as the app; the defaults stand in for a valid row. */
const insert = ({
  monday = '2026-10-26',
  meetingDate = monday,
  schoolYear = '2026/2027',
}: { monday?: string; meetingDate?: string; schoolYear?: string } = {}) =>
  database.db.execute(sql`
    INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
    VALUES (${monday}, ${meetingDate}, ${schoolYear}, '2026-10-23T10:00:00Z')
    RETURNING id`);

describe('issue guards (migrations 0011 and 0012)', () => {
  it('accepts a meeting on its Monday or later in the same week', async () => {
    await insert({ monday: '2026-11-02' });
    await insert({ monday: '2026-11-09', meetingDate: '2026-11-15' });
  });

  it('refuses a second issue for the same Monday by its unique key', async () => {
    await insert({ monday: '2026-11-16' });
    expect(await pgErrorOf(insert({ monday: '2026-11-16' }))).toMatchObject({
      code: '23505',
      constraint: 'issues_monday_key',
    });
  });

  it.each([
    [{ monday: '2026-10-27' }, 'issues_is_monday'],
    [{ monday: '2026-11-23', schoolYear: '2026/27' }, 'issues_school_year'],
    [{ monday: '2026-11-23', schoolYear: 'x2026/2027' }, 'issues_school_year'],
  ])('refuses %o by %s', async (row, constraint) => {
    expect(await pgErrorOf(insert(row))).toMatchObject({ code: CHECK, constraint });
  });

  // Migration 0034: the meeting may be any date, so the week no longer bounds it.
  it.each([
    ['2026-11-22', '2027-02-01'],
    ['2026-11-30', '2027-02-08'],
    ['2027-01-15', '2027-02-15'],
  ])('lets the meeting of a Monday fall on %s', async (meetingDate, monday) => {
    await insert({ monday, meetingDate });
  });

  it('lets a version rise by exactly one, for the app and the owner alike', async () => {
    await insert({ monday: '2026-12-07' });
    const bump = (by: string) =>
      sql.raw(`UPDATE issues SET status = 'generated', version = version ${by}
                WHERE monday = '2026-12-07'`);
    for (const by of ['+ 0', '+ 2', '- 1']) {
      expect(await pgErrorOf(database.db.execute(bump(by))), by).toMatchObject({
        code: CHECK,
        constraint: 'version_bump',
      });
    }
    await expect(
      database.owner(`UPDATE issues SET version = 7 WHERE monday = '2026-12-07'`),
    ).rejects.toMatchObject({ code: CHECK, constraint: 'version_bump' });
    // An UPDATE that leaves version out is the lost update the guard exists to stop.
    const statusOnly = `UPDATE issues SET status = 'generated' WHERE monday = '2026-12-07'`;
    expect(await pgErrorOf(database.db.execute(sql.raw(statusOnly)))).toMatchObject({
      code: CHECK,
      constraint: 'version_bump',
    });
    await expect(database.owner(statusOnly)).rejects.toMatchObject({
      code: CHECK,
      constraint: 'version_bump',
    });
    await database.db.execute(bump('+ 1'));
    const [row] = await database.owner<{ status: string; version: number }>(
      `SELECT status, version FROM issues WHERE monday = '2026-12-07'`,
    );
    expect(row).toEqual({ status: 'generated', version: 2 });
  });
});
