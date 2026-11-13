/**
 * The porada, registry and settings rows a journey of M9 makes, for the tests that start from or
 * clean up after them. The issues table is shared by the whole run: each journey works on Mondays of
 * its own (far enough ahead for no seeded point to sit on them) and forgets them again.
 */
import { snapshotFixture } from '../support/snapshots';
import { withClient } from './db';

const DAY_MS = 86_400_000;

/** Today's date in Prague as ISO. */
export function pragueToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
}

/** The Monday `weeks` weeks after this week's Monday (the calendar's first slot), as ISO. */
export function mondayIn(weeks: number): string {
  const today = new Date(`${pragueToday()}T00:00:00Z`);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - sinceMonday * DAY_MS + weeks * 7 * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/**
 * Gives the porada of this Monday a meeting date, making its row if it has none (the school year
 * and the deadline a day before the meeting are the row's own, as `ensureIssue` would write them
 * roughly). Arch previews and generates only the working porada, the first open one whose meeting
 * is today or later: a past date makes a later porada the working one and this one an earlier one.
 */
export async function setMeetingDate(monday: string, meetingDate: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
       VALUES ($1::date, $2::date,
               CASE WHEN extract(month FROM $1::date) >= 9
                    THEN extract(year FROM $1::date)::int || '/' || (extract(year FROM $1::date)::int + 1)
                    ELSE (extract(year FROM $1::date)::int - 1) || '/' || extract(year FROM $1::date)::int END,
               $2::date - 1)
       ON CONFLICT (monday) DO UPDATE SET meeting_date = EXCLUDED.meeting_date, version = issues.version + 1`,
      [monday, meetingDate],
    );
  });
}

/** Whether the porada of this Monday has its generated document stored. */
export async function hasDocument(monday: string): Promise<boolean> {
  return withClient(async (client) => {
    const { rowCount } = await client.query(
      'SELECT 1 FROM generated_documents d JOIN issues i ON i.id = d.issue_id WHERE i.monday = $1::date',
      [monday],
    );
    return rowCount === 1;
  });
}

/** An ISO date `days` after another. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
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

/** Deletes the issue rows of these Mondays with their outlines, as if nobody had touched them. */
async function forgetIssues(mondays: readonly string[]): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      'DELETE FROM issue_items WHERE issue_id IN (SELECT id FROM issues WHERE monday = ANY($1::date[]))',
      [mondays],
    );
    await client.query('DELETE FROM issues WHERE monday = ANY($1::date[])', [mondays]);
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
