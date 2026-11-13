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
const FOREIGN_KEY = '23503';
// The CHECK numbers are the app's caps: each is accepted at the cap and refused one past it.
const {
  title: TITLE,
  place: PLACE,
  note: NOTE,
  organizer: ORGANIZER,
  participants: PARTICIPANTS,
  futureNote: FUTURE_NOTE,
} = POINT_LIMITS;

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

/** An INSERT as the app; values are parameters. */
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

/** A draft akce as the app; the defaults stand in for a valid row. */
const insertItem = async (row: Row = {}) => {
  const result = await insertInto('future_items', {
    kind: 'akce',
    author_id: authorId,
    client_ref: randomUUID(),
    ...row,
  });
  return (result.rows[0] as { id: string }).id;
};

/** A complete submitted akce, which future_items_submitted_complete accepts. */
const SUBMITTED: Row = {
  state: 'submitted',
  title: 'Den otevřených dveří',
  start_date: '2026-11-12',
  submitted_at: '2026-10-21T08:00:00Z',
};

const insertEvent = (futureItemId: string, row: Row = {}) =>
  insertInto('future_events', {
    future_item_id: futureItemId,
    actor_id: authorId,
    event: 'submit',
    from_state: 'draft',
    to_state: 'submitted',
    ...row,
  });

const insertReport = (row: Row = {}) =>
  insertInto('points', {
    kind: 'report',
    author_id: authorId,
    client_ref: randomUUID(),
    type_id: typeId,
    body: '{"type":"doc","content":[]}',
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

describe('future item guards (migrations 0019 and 0020)', () => {
  it('accepts a draft, a complete submitted akce and a jednání', async () => {
    await insertItem();
    await insertItem(SUBMITTED);
    await insertItem({ ...SUBMITTED, kind: 'jednani', state: 'approved' });
    await insertItem({ ...SUBMITTED, state: 'cancelled', report_state: 'written' });
  });

  // The defaults leave title and start empty: only an author's states allow that.
  it.each<[Row]>([
    [{ campus: 'smichov' }],
    [{ campus: 'jinde' }],
    [{ start_date: '2026-11-12', end_date: '2026-11-12' }],
    [{ state: 'returned' }],
    [{ state: 'rejected' }],
    [{ state: 'withdrawn' }],
    [{ report_state: 'written' }],
    [{ organizer: 'organizuje paní Jana Nováková', participants: 'účast 2.A', note: 'téma' }],
  ])('accepts %o', async (row) => {
    await insertItem(row);
  });

  it.each([
    [{ kind: 'jednani', report_state: 'written' }, 'future_items_report_akce'],
    [{ end_date: '2026-11-12' }, 'future_items_dates'],
    [{ start_date: '2026-11-12', end_date: '2026-11-11' }, 'future_items_dates'],
    [{ campus: 'karlin' }, 'future_items_campus'],
    [{ title: 'x'.repeat(TITLE + 1) }, 'future_items_lengths'],
    [{ place: 'x'.repeat(PLACE + 1) }, 'future_items_lengths'],
    [{ organizer: 'x'.repeat(ORGANIZER + 1) }, 'future_items_lengths'],
    [{ participants: 'x'.repeat(PARTICIPANTS + 1) }, 'future_items_lengths'],
    [{ note: 'x'.repeat(FUTURE_NOTE + 1) }, 'future_items_lengths'],
    [{ ...SUBMITTED, title: '' }, 'future_items_submitted_complete'],
    [{ ...SUBMITTED, state: 'approved', start_date: null }, 'future_items_submitted_complete'],
    [{ ...SUBMITTED, state: 'cancelled', submitted_at: null }, 'future_items_submitted_complete'],
  ])('refuses %o by %s', async (row, constraint) => {
    expect(await pgErrorOf(insertItem(row))).toMatchObject({ code: CHECK, constraint });
  });

  it('has no declined report and no switch for one: every approved akce owes it (ADR 0048)', async () => {
    // 22P02: not a value of the enum
    expect(await pgErrorOf(insertItem({ report_state: 'declined' }))).toMatchObject({
      code: '22P02',
    });
    const [column] = await database.owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'future_items' AND column_name = 'expects_report'`,
    );
    expect(column).toEqual({ n: 0 });
  });

  it('accepts every length at its cap, counted in characters, not bytes', async () => {
    await insertItem({ title: 'č'.repeat(TITLE), place: 'ž'.repeat(PLACE) });
  });

  it('refuses a second akce with the same client ref from one author', async () => {
    const clientRef = randomUUID();
    await insertItem({ client_ref: clientRef });
    expect(await pgErrorOf(insertItem({ client_ref: clientRef }))).toMatchObject({
      code: '23505',
      constraint: 'future_items_author_client_ref_key',
    });
  });

  it('surfaces the unregistered CHECKs as a database failure named by its constraint', async () => {
    expect(await portErrorOf(insertItem({ ...SUBMITTED, title: '' }))).toEqual(
      new DatabaseFailure('db.constraint.future_items_submitted_complete'),
    );
    expect(await portErrorOf(insertItem({ end_date: '2026-11-12' }))).toEqual(
      new DatabaseFailure('db.constraint.future_items_dates'),
    );
  });

  it('lets a version rise by exactly one, for the app and the owner alike', async () => {
    const id = await insertItem();
    const update = (set: string) => sql.raw(`UPDATE future_items SET ${set} WHERE id = '${id}'`);
    const bumpRefused = { code: CHECK, constraint: 'version_bump' };
    for (const set of ["title = 'a'", 'version = version + 0', 'version = version + 2']) {
      expect(await pgErrorOf(database.db.execute(update(set))), set).toMatchObject(bumpRefused);
    }
    await expect(
      database.owner(`UPDATE future_items SET title = 'a' WHERE id = '${id}'`),
    ).rejects.toMatchObject(bumpRefused);
    await database.db.execute(update("title = 'a', version = version + 1"));
    const [row] = await database.owner<{ title: string; version: number }>(
      `SELECT title, version FROM future_items WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ title: 'a', version: 2 });
  });

  it.each([
    [{ note: '' }, 'future_events_note'],
    [{ note: 'x'.repeat(NOTE + 1) }, 'future_events_note'],
    [{ event: 'return', to_state: 'returned' }, 'future_events_note_required'],
    [{ event: 'reject', to_state: 'rejected' }, 'future_events_note_required'],
    [
      { event: 'refuse-cancel', from_state: 'approved', to_state: 'approved' },
      'future_events_note_required',
    ],
  ])('refuses the event %o by %s', async (row, constraint) => {
    const itemId = await insertItem();
    expect(await pgErrorOf(insertEvent(itemId, row))).toMatchObject({ code: CHECK, constraint });
  });

  it('accepts a noted return, a system event and a reviewer edit', async () => {
    const itemId = await insertItem();
    await insertEvent(itemId, { event: 'return', to_state: 'returned', note: 'x'.repeat(NOTE) });
    await insertEvent(itemId, { actor_id: null, event: 'cancel', to_state: 'cancelled' });
    await insertEvent(itemId, {
      ...{ event: 'edit', from_state: 'submitted', to_state: 'submitted' },
      ...{ edited_fields: '{title}' },
    });
  });

  it('keeps future events append-only, yet deletes them with their item', async () => {
    const itemId = await insertItem();
    await insertEvent(itemId);
    const update = `UPDATE future_events SET note = 'změna' WHERE future_item_id = '${itemId}'`;
    // The app lacks the privilege (REVOKE); the trigger binds the owner as well.
    expect(await pgErrorOf(database.db.execute(sql.raw(update)))).toMatchObject({ code: DENIED });
    expect(await pgErrorOf(database.db.execute(sql`TRUNCATE future_events`))).toMatchObject({
      code: DENIED,
    });
    await expect(database.owner(update)).rejects.toMatchObject({ code: DENIED });
    await expect(database.owner('TRUNCATE future_events')).rejects.toMatchObject({ code: DENIED });
    const remove = sql`DELETE FROM future_events WHERE future_item_id = ${itemId}`;
    expect(await pgErrorOf(database.db.execute(remove))).toMatchObject({ code: DENIED });
    const privileges = await database.owner<{
      update: boolean;
      delete: boolean;
      truncate: boolean;
    }>(
      `SELECT has_table_privilege('autoporada_app', 'future_events', 'UPDATE') AS update,
              has_table_privilege('autoporada_app', 'future_events', 'DELETE') AS delete,
              has_table_privilege('autoporada_app', 'future_events', 'TRUNCATE') AS truncate`,
    );
    expect(privileges).toEqual([{ update: false, delete: false, truncate: false }]);

    // The cascade runs as the owner of future_events, so the app's DELETE of the item still works.
    await database.db.execute(sql`DELETE FROM future_items WHERE id = ${itemId}`);
    const [left] = await database.owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM future_events WHERE future_item_id = $1`,
      [itemId],
    );
    expect(left).toEqual({ n: 0 });
  });

  it('ties a report to the akce it answers, and an akce to the report it got', async () => {
    const itemId = await insertItem();
    const reportId = ((await insertReport({ future_item_id: itemId })).rows[0] as { id: string })
      .id;
    await database.db.execute(sql`
      UPDATE future_items SET report_point_id = ${reportId}, report_state = 'written',
                              version = version + 1
       WHERE id = ${itemId}`);
    expect(await pgErrorOf(insertReport({ future_item_id: randomUUID() }))).toMatchObject({
      code: FOREIGN_KEY,
      constraint: 'points_future_item_id_future_items_id_fk',
    });
    expect(await pgErrorOf(insertItem({ report_point_id: randomUUID() }))).toMatchObject({
      code: FOREIGN_KEY,
      constraint: 'future_items_report_point_id_points_id_fk',
    });
    // Neither side is deleted from under the other.
    expect(
      await pgErrorOf(database.db.execute(sql`DELETE FROM future_items WHERE id = ${itemId}`)),
    ).toMatchObject({ code: FOREIGN_KEY });
    expect(
      await pgErrorOf(database.db.execute(sql`DELETE FROM points WHERE id = ${reportId}`)),
    ).toMatchObject({
      code: FOREIGN_KEY,
      constraint: 'future_items_report_point_id_points_id_fk',
    });
  });
});
