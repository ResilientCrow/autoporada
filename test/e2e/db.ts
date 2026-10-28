/**
 * Writes the e2e database directly, as its owner, for what the UI cannot do
 * to a test's own session, and for the points a journey starts from. Sessions are
 * keyed by the cookie of that test, points by the e-mail of the journey's persona,
 * so parallel tests never touch each other's rows.
 */
import { createHash } from 'node:crypto';

import { Client } from 'pg';

import { databaseUrl } from '../support/template-db';

/** This run's database, rebuilt by global-setup.ts. */
export const E2E_DATABASE = 'autoporada_e2e';

/** What the sessions table stores: the SHA-256 of the cookie value (see src/server/auth/tokens.ts). */
const digestOf = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest();

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl(E2E_DATABASE) });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Ends the session of this cookie. It changes neither role nor status, so no
 * trigger signs anyone else out. Returns how many rows went; a test expects 1.
 */
export async function endSession(token: string): Promise<number> {
  const result = await withClient((client) =>
    client.query('DELETE FROM sessions WHERE token_hash = $1', [digestOf(token)]),
  );
  return result.rowCount ?? 0;
}

/**
 * Makes the sign-in of this cookie's session `minutes` older, so step-up sees it stale.
 * It touches neither role nor status. Returns how many rows changed; a test expects 1.
 */
export async function ageSession(token: string, minutes: number): Promise<number> {
  const result = await withClient((client) =>
    client.query(
      "UPDATE sessions SET auth_time = auth_time - $2::int * interval '1 minute' WHERE token_hash = $1",
      [digestOf(token), minutes],
    ),
  );
  return result.rowCount ?? 0;
}

/** The people of a journey: the mock IdP's persona is `<name>-d` on desktop and `<name>-m` on mobile. */
export const personaOf = (name: string, project: string): { subject: string; email: string } => {
  const subject = `${name}-${project === 'desktop' ? 'd' : 'm'}`;
  return { subject, email: `${subject}@ssps.cz` };
};

const PEOPLE_BULLETS = [
  {
    key: 'organisers',
    label: 'Organizátoři',
    kind: 'people',
    order: 'input',
    people: [{ salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' }],
  },
  {
    key: 'participants',
    label: 'Účastníci',
    kind: 'people',
    order: 'input',
    people: [{ salutation: 'pan', givenName: 'Ondřej', familyName: 'Pech' }],
  },
];

const STATEMENTS = [
  {
    speaker: { salutation: 'pan', givenName: 'Ondřej', familyName: 'Pech' },
    speakerGenitive: 'Ondřeje Pecha',
    quote: 'Čtení mě baví.',
  },
];

/**
 * A complete „Seminář“ of `email` (nothing left to fill in, so it can be handed in again) in the
 * state a journey starts from: `draft`, or `submitted` as if handed in a moment ago, with its
 * „submit“ event. It is not exactly what the UI makes: a submitted seed sets `earliest_monday`
 * without the issue row the UI's first submit ensures. Returns its id.
 */
export async function seedPoint(
  email: string,
  title: string,
  state: 'draft' | 'submitted',
): Promise<string> {
  return withClient(async (client) => {
    const submitted = state === 'submitted';
    const { rows } = await client.query<{ id: string }>(
      `WITH made AS (
         INSERT INTO points (kind, author_id, client_ref, type_id, state, title, event_date, opening, body,
                             bullets, statements, earliest_monday, submitted_at)
         SELECT 'report', u.id, gen_random_uuid(), (SELECT id FROM point_types WHERE name = 'Seminář'),
                $3::point_state, $2, current_date + 30, 'Proběhl seminář.',
                '{"type":"doc","content":[]}'::jsonb, $4::jsonb, $5::jsonb,
                CASE WHEN $6 THEN date_trunc('week', current_date + 14)::date END,
                CASE WHEN $6 THEN now() END
           FROM users u WHERE u.email = $1
         RETURNING id, author_id
       ), event AS (
         INSERT INTO point_events (point_id, actor_id, event, from_state, to_state)
         SELECT id, author_id, 'submit', 'draft', 'submitted' FROM made WHERE $6
       )
       SELECT id FROM made`,
      [email, title, state, JSON.stringify(PEOPLE_BULLETS), JSON.stringify(STATEMENTS), submitted],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error(`no user with the e-mail of this journey: ${email}`);
    return id;
  });
}

/** Deletes every point of this author (and, by cascade, their events), so a journey leaves nothing in the shared queue. */
export async function forgetPointsOf(email: string): Promise<void> {
  await withClient((client) =>
    client.query('DELETE FROM points WHERE author_id = (SELECT id FROM users WHERE email = $1)', [
      email,
    ]),
  );
}

/** The ids of this author's points, newest first. */
export async function pointIdsOf(email: string): Promise<string[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT p.id FROM points p JOIN users u ON u.id = p.author_id
        WHERE u.email = $1 ORDER BY p.created_at DESC`,
      [email],
    );
    return rows.map((row) => row.id);
  });
}
