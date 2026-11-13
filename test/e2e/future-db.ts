/**
 * The akce of a journey, written straight into the e2e database like the points of db.ts: the state a
 * test starts from, a way to move an akce into the past (no UI does that), and the clean-up. Items are
 * found by the e-mail of the journey's persona or by id, so parallel tests never touch each other's rows.
 */
import { withClient } from './db';

/** What the table holds of one akce, for a test that checks what was stored. */
export async function readFuture(id: string): Promise<{
  state: string;
  version: number;
  title: string;
  reportState: string;
  reportPointId: string | null;
  cancelRequested: boolean;
}> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT state, version, title, report_state AS "reportState", report_point_id AS "reportPointId",
              cancel_requested_at IS NOT NULL AS "cancelRequested"
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
