/**
 * The porada, registry and settings rows a journey of M9 makes, for the tests that start from or
 * clean up after them. The issues table is shared by the whole run: each journey works on Mondays of
 * its own (far enough ahead for no seeded point to sit on them) and forgets them again.
 */
import { snapshotFixture } from '../support/snapshots';
import { withClient } from './db';

const DAY_MS = 86_400_000;

/** Today's date in Prague as ISO. */
function pragueToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
}

/** The Monday `weeks` weeks after this week's Monday (the calendar's first slot), as ISO. */
export function mondayIn(weeks: number): string {
  const today = new Date(`${pragueToday()}T00:00:00Z`);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - sinceMonday * DAY_MS + weeks * 7 * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** An ISO date `days` after another. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Deletes the issue rows of these Mondays with their outlines, as if nobody had touched them. */
export async function forgetIssues(mondays: readonly string[]): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      'DELETE FROM issue_items WHERE issue_id IN (SELECT id FROM issues WHERE monday = ANY($1::date[]))',
      [mondays],
    );
    await client.query('DELETE FROM issues WHERE monday = ANY($1::date[])', [mondays]);
  });
}

/**
 * A complete „Seminář“ report of `email`, handed in for the porada of `monday` (as `submit` would have
 * stored it) at `submittedAt`, about an event on `eventDate`. The server's clock is the real one, so a
 * hand-in at a given hour is stored here, not made through the form. Returns its id.
 */
export async function seedHandedIn(
  email: string,
  title: string,
  state: 'submitted' | 'approved',
  { monday, eventDate, submittedAt }: { monday: string; eventDate: string; submittedAt: string },
): Promise<string> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO points (kind, author_id, client_ref, type_id, state, title, event_date, opening, body,
                           bullets, statements, earliest_monday, submitted_at, hand_in_monday)
       SELECT 'report', u.id, gen_random_uuid(), 'seminar',
              $3::point_state, $2, $5::date, 'Proběhl seminář.', '{"type":"doc","content":[]}'::jsonb,
              '[]'::jsonb, '[]'::jsonb, $4::date, $6::timestamptz, $4::date
         FROM users u WHERE u.email = $1
       RETURNING id`,
      [email, title, state, monday, eventDate, submittedAt],
    );
    const made = rows[0];
    if (!made) throw new Error(`no user with the e-mail of this journey: ${email}`);
    return made.id;
  });
}

/**
 * A generated porada for `monday`, as the archive lists it: an issue with a document whose PDF is
 * pending (so only the DOCX link shows). The snapshot is the template replica moved to this Monday,
 * so the Arch archive can compose it and offers the link; the DOCX bytes are never read. Undo it
 * with `forgetDocument`, which the archive and the download link then both miss.
 */
export async function seedDocument(monday: string): Promise<void> {
  const snapshot = snapshotFixture('template-replica', (raw) => {
    raw['issue'] = { id: `issue-${monday}`, monday, meetingDate: monday, schoolYear: '2026/2027' };
  });
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at, status)
       VALUES ($1::date, $1::date, '2026/2027', now(), 'generated') RETURNING id`,
      [monday],
    );
    const issue = rows[0];
    if (!issue) throw new Error('no issue was made');
    await client.query(
      `INSERT INTO generated_documents (issue_id, snapshot, docx, docx_sha256)
       VALUES ($1, $2::jsonb, '\\x00', repeat('0', 64))`,
      [issue.id, JSON.stringify(snapshot)],
    );
  });
}

/** Deletes the generated document of this Monday and its issue. */
export async function forgetDocument(monday: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      'DELETE FROM generated_documents WHERE issue_id IN (SELECT id FROM issues WHERE monday = $1::date)',
      [monday],
    );
  });
  await forgetIssues([monday]);
}

/** The stored `calendar` setting (`plannedThrough`, ADR 0054), or null when there is none. */
export async function readCalendarSetting(): Promise<unknown> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key = 'calendar'",
    );
    return rows[0]?.value ?? null;
  });
}

/** Puts the `calendar` setting back as `readCalendarSetting` found it; null removes it. */
export async function restoreCalendarSetting(value: unknown): Promise<void> {
  await withClient(async (client) => {
    if (value === null) await client.query("DELETE FROM settings WHERE key = 'calendar'");
    else {
      await client.query("UPDATE settings SET value = $1::jsonb WHERE key = 'calendar'", [
        JSON.stringify(value),
      ]);
    }
  });
}
