import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { DatabaseFailure } from '@/application/ports';
import { POINT_LIMITS } from '@/domain/report';
import { toPortError } from '@/infra/db/pg-errors';

import { pgErrorOf, setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const CHECK = '23514';
const DENIED = '42501';
const MAX_CONTENT = 262_144;
// The CHECK numbers are the app's caps: each is accepted at the cap and refused one past it.
const { title: TITLE, opening: OPENING, place: PLACE, note: NOTE } = POINT_LIMITS;

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

type Row = Record<string, unknown>;

/** An INSERT as the app; values are parameters unless they are SQL already. */
const insertInto = (table: string, row: Row) =>
  database.db.execute(sql`
    INSERT INTO ${sql.identifier(table)}
      (${sql.join(
        Object.keys(row).map((column) => sql.identifier(column)),
        sql`, `,
      )})
    VALUES (${sql.join(
      Object.values(row).map((value) => sql`${value}`),
      sql`, `,
    )})
    RETURNING id`);

/** A draft report as the app; the defaults stand in for a valid row. */
const insertPoint = async (row: Row = {}) => {
  const result = await insertInto('points', {
    kind: 'report',
    author_id: authorId,
    client_ref: randomUUID(),
    type_id: typeId,
    body: '{"type":"doc","content":[]}',
    ...row,
  });
  return (result.rows[0] as { id: string }).id;
};

/** A complete submitted report, which points_submitted_complete accepts. */
const SUBMITTED: Row = {
  state: 'submitted',
  title: 'Seminář o vodě',
  event_date: '2026-10-20',
  opening: 'Ve čtvrtek proběhl seminář.',
  earliest_monday: '2026-10-26',
  submitted_at: '2026-10-21T08:00:00Z',
};

const insertEvent = (pointId: string, row: Row = {}) =>
  insertInto('point_events', {
    point_id: pointId,
    actor_id: authorId,
    event: 'submit',
    from_state: 'draft',
    to_state: 'submitted',
    ...row,
  });

/** The port error a repository would throw for this refused query. */
const portErrorOf = (query: Promise<unknown>) =>
  query.then(
    () => {
      throw new Error('expected the query to fail');
    },
    (error: unknown) => toPortError(error),
  );

describe('point guards (migrations 0015 and 0016)', () => {
  it('accepts a draft, a complete submitted report and a submitted proposal', async () => {
    await insertPoint();
    await insertPoint(SUBMITTED);
    await insertPoint({
      ...{ kind: 'finance', type_id: null, state: 'approved', title: 'Nákup tabulí' },
      ...{ earliest_monday: '2026-11-02', submitted_at: '2026-10-21T08:00:00Z' },
    });
  });

  // The defaults leave title, opening and every date empty: only an author's states allow that.
  it.each<[Row]>([
    [{ campus: 'smichov' }],
    [{ campus: 'radlice' }],
    [{ campus: 'na-vidouli' }],
    [{ campus: 'jinde' }],
    [{ event_date: '2026-10-20', end_date: '2026-10-20' }],
    [{ state: 'returned' }],
    [{ state: 'withdrawn' }],
    [{ state: 'rejected' }],
  ])('accepts %o', async (row) => {
    await insertPoint(row);
  });

  it.each([
    [{ kind: 'report', type_id: null }, 'points_kind_type'],
    [{ kind: 'finance' }, 'points_kind_type'],
    [{ campus: 'karlin' }, 'points_campus'],
    [{ earliest_monday: '2026-10-27' }, 'points_monday'],
    [{ title: 'x'.repeat(TITLE + 1) }, 'points_lengths'],
    [{ opening: 'x'.repeat(OPENING + 1) }, 'points_lengths'],
    [{ place: 'x'.repeat(PLACE + 1) }, 'points_lengths'],
    [{ end_date: '2026-10-20' }, 'points_dates'],
    [{ event_date: '2026-10-20', end_date: '2026-10-19' }, 'points_dates'],
    [{ ...SUBMITTED, title: '' }, 'points_submitted_complete'],
    [{ ...SUBMITTED, state: 'approved', opening: '' }, 'points_submitted_complete'],
    [{ ...SUBMITTED, state: 'published', event_date: null }, 'points_submitted_complete'],
    [{ ...SUBMITTED, earliest_monday: null }, 'points_submitted_complete'],
    [{ ...SUBMITTED, submitted_at: null }, 'points_submitted_complete'],
  ])('refuses %o by %s', async (row, constraint) => {
    expect(await pgErrorOf(insertPoint(row))).toMatchObject({ code: CHECK, constraint });
  });

  it('accepts every length at its POINT_LIMITS cap, counted in characters, not bytes', async () => {
    await insertPoint({
      title: 'č'.repeat(TITLE),
      opening: 'ř'.repeat(OPENING),
      place: 'ž'.repeat(PLACE),
    });
  });

  it('refuses a second point with the same client ref from one author', async () => {
    const clientRef = randomUUID();
    await insertPoint({ client_ref: clientRef });
    expect(await pgErrorOf(insertPoint({ client_ref: clientRef }))).toMatchObject({
      code: '23505',
      constraint: 'points_author_client_ref_key',
    });
  });

  it('surfaces the unregistered readiness CHECKs as a database failure named by its constraint', async () => {
    expect(await portErrorOf(insertPoint({ ...SUBMITTED, title: '' }))).toEqual(
      new DatabaseFailure('db.constraint.points_submitted_complete'),
    );
    expect(await portErrorOf(insertPoint({ end_date: '2026-10-20' }))).toEqual(
      new DatabaseFailure('db.constraint.points_dates'),
    );
  });

  it('bounds body, bullets and statements together at 256 KiB as PostgreSQL renders them', async () => {
    // jsonb::text is PostgreSQL's own rendering, so the padding is tuned by what it reports.
    const [empty] = await database.owner<{ bytes: number }>(
      `SELECT octet_length(jsonb_build_object('pad', '')::text)
            + octet_length('[]'::jsonb::text) * 2 AS bytes`,
    );
    const body = (bytes: number) =>
      sql`jsonb_build_object('pad', repeat('x', ${bytes - empty!.bytes}::int))`;
    const id = await insertPoint({ body: body(MAX_CONTENT) });
    const [stored] = await database.owner<{ bytes: number }>(
      `SELECT octet_length(body::text) + octet_length(bullets::text)
            + octet_length(statements::text) AS bytes FROM points WHERE id = $1`,
      [id],
    );
    expect(stored).toEqual({ bytes: MAX_CONTENT });
    expect(await pgErrorOf(insertPoint({ body: body(MAX_CONTENT + 1) }))).toMatchObject({
      code: CHECK,
      constraint: 'points_content_size',
    });
  });

  it('lets a version rise by exactly one, for the app and the owner alike', async () => {
    const id = await insertPoint();
    const update = (set: string) => sql.raw(`UPDATE points SET ${set} WHERE id = '${id}'`);
    const bumpRefused = { code: CHECK, constraint: 'version_bump' };
    for (const set of ["title = 'a'", 'version = version + 0', 'version = version + 2']) {
      expect(await pgErrorOf(database.db.execute(update(set))), set).toMatchObject(bumpRefused);
    }
    await expect(
      database.owner(`UPDATE points SET title = 'a' WHERE id = '${id}'`),
    ).rejects.toMatchObject(bumpRefused);
    await database.db.execute(update("title = 'a', version = version + 1"));
    const [row] = await database.owner<{ title: string; version: number }>(
      `SELECT title, version FROM points WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ title: 'a', version: 2 });
  });

  it('sets the earliest Monday once and never moves or clears it', async () => {
    const id = await insertPoint();
    const setMonday = (monday: string) =>
      database.db.execute(sql`
        UPDATE points SET earliest_monday = ${monday === 'null' ? null : monday},
                          version = version + 1
         WHERE id = ${id}`);
    const fixed = { code: CHECK, constraint: 'points_earliest_fixed' };
    await setMonday('2026-10-26');
    for (const monday of ['2026-11-02', 'null']) {
      expect(await pgErrorOf(setMonday(monday)), monday).toMatchObject(fixed);
    }
    await expect(
      database.owner(
        `UPDATE points SET earliest_monday = '2026-11-09', version = version + 1 WHERE id = $1`,
        [id],
      ),
    ).rejects.toMatchObject(fixed);
    await setMonday('2026-10-26');
    const [row] = await database.owner<{ monday: string; version: number }>(
      `SELECT earliest_monday::text AS monday, version FROM points WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ monday: '2026-10-26', version: 3 });
  });

  it.each([
    [{ note: '' }, 'point_events_note'],
    [{ note: 'x'.repeat(NOTE + 1) }, 'point_events_note'],
    [{ event: 'return', to_state: 'returned' }, 'point_events_note_required'],
    [{ event: 'reject', to_state: 'rejected' }, 'point_events_note_required'],
    [{ before: '{"title":"Starý"}' }, 'point_events_before_edit'],
  ])('refuses the event %o by %s', async (row, constraint) => {
    const pointId = await insertPoint();
    expect(await pgErrorOf(insertEvent(pointId, row))).toMatchObject({ code: CHECK, constraint });
  });

  it('accepts a noted return, a system event and a reviewer edit with its previous values', async () => {
    const pointId = await insertPoint();
    await insertEvent(pointId, { event: 'return', to_state: 'returned', note: 'x'.repeat(NOTE) });
    await insertEvent(pointId, { actor_id: null, event: 'publish', to_state: 'published' });
    await insertEvent(pointId, {
      ...{ event: 'edit', from_state: 'submitted', to_state: 'submitted' },
      ...{ edited_fields: '{title}', before: '{"title":"Starý"}' },
    });
  });

  it('keeps point events append-only, yet deletes them with their point', async () => {
    const pointId = await insertPoint();
    await insertEvent(pointId);
    const update = `UPDATE point_events SET note = 'změna' WHERE point_id = '${pointId}'`;
    // The app lacks the privilege (REVOKE); the trigger binds the owner as well.
    expect(await pgErrorOf(database.db.execute(sql.raw(update)))).toMatchObject({ code: DENIED });
    expect(await pgErrorOf(database.db.execute(sql`TRUNCATE point_events`))).toMatchObject({
      code: DENIED,
    });
    await expect(database.owner(update)).rejects.toMatchObject({ code: DENIED });
    await expect(database.owner('TRUNCATE point_events')).rejects.toMatchObject({ code: DENIED });
    const remove = sql`DELETE FROM point_events WHERE point_id = ${pointId}`;
    expect(await pgErrorOf(database.db.execute(remove))).toMatchObject({ code: DENIED });
    const privileges = await database.owner<{
      update: boolean;
      delete: boolean;
      truncate: boolean;
    }>(
      `SELECT has_table_privilege('autoporada_app', 'point_events', 'UPDATE') AS update,
              has_table_privilege('autoporada_app', 'point_events', 'DELETE') AS delete,
              has_table_privilege('autoporada_app', 'point_events', 'TRUNCATE') AS truncate`,
    );
    expect(privileges).toEqual([{ update: false, delete: false, truncate: false }]);

    // The cascade runs as the owner of point_events, so the app's DELETE of the point still works.
    await database.db.execute(sql`DELETE FROM points WHERE id = ${pointId}`);
    const [left] = await database.owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM point_events WHERE point_id = $1`,
      [pointId],
    );
    expect(left).toEqual({ n: 0 });
  });
});
