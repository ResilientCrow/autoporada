/**
 * The akce of a journey, written straight into the e2e database like the points of db.ts: the state a
 * test starts from, a way to move an akce into the past (no UI does that), and the clean-up. Items are
 * found by the e-mail of the journey's persona or by id, so parallel tests never touch each other's rows.
 */
import { withClient } from './db';

/** The states a test starts an akce in. */
export type SeedFutureState = 'draft' | 'submitted' | 'approved';

interface SeedFutureOptions {
  readonly kind?: 'akce' | 'jednani';
  /** Days from today to the first day; negative is the past. */
  readonly startInDays?: number;
}

/** A complete akce of `email` in `state`, with an organizer. Returns its id. */
export async function seedFuture(
  email: string,
  title: string,
  state: SeedFutureState,
  { kind = 'akce', startInDays = 30 }: SeedFutureOptions = {},
): Promise<string> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO future_items (kind, author_id, client_ref, state, title, start_date, end_date, organizer,
                                submitted_at)
       SELECT $2::future_kind, u.id, gen_random_uuid(), $3::future_state, $4, current_date + $5::int,
              current_date + $5::int, $6,
              CASE WHEN $3 = 'draft' THEN NULL ELSE now() END
         FROM users u WHERE u.email = $1
       RETURNING id`,
      [email, kind, state, title, startInDays, 'organizuje paní Jana Nováková (8. A)'],
    );
    const made = rows[0];
    if (!made) throw new Error(`no user with the e-mail of this journey: ${email}`);
    return made.id;
  });
}

/** Moves the akce `days` days into the past, as time passing would (the version rises with it, as the guard demands). Returns its new day as ISO. */
export async function moveFutureToPast(id: string, days: number): Promise<string> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ day: string }>(
      `UPDATE future_items SET start_date = current_date - $2::int, end_date = current_date - $2::int,
                               version = version + 1
        WHERE id = $1 RETURNING to_char(start_date, 'YYYY-MM-DD') AS day`,
      [id, days],
    );
    if (!rows[0]) throw new Error(`no akce ${id}`);
    return rows[0].day;
  });
}

/** What the table holds of one akce, for a test that checks what was stored. */
export async function readFuture(id: string): Promise<{
  state: string;
  version: number;
  title: string;
  reportState: string;
  reportPointId: string | null;
}> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT state, version, title, report_state AS "reportState", report_point_id AS "reportPointId"
         FROM future_items WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new Error(`no akce ${id}`);
    return rows[0];
  });
}

/** Deletes every akce of this author, the reports written for them and their events. */
export async function forgetFutureOf(email: string): Promise<void> {
  await withClient(async (client) => {
    const own = '(SELECT id FROM users WHERE email = $1)';
    await client.query(
      `UPDATE future_items SET report_point_id = NULL, version = version + 1 WHERE author_id = ${own}`,
      [email],
    );
    await client.query(
      `DELETE FROM points WHERE future_item_id IN (SELECT id FROM future_items WHERE author_id = ${own})`,
      [email],
    );
    await client.query(`DELETE FROM future_items WHERE author_id = ${own}`, [email]);
  });
}
