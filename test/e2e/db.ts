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

export async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
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

/** The states a point row holds. */
type StoredState =
  'draft' | 'submitted' | 'returned' | 'approved' | 'rejected' | 'withdrawn' | 'published';

/** What a point is seeded as: a state, or `resubmitted`, a submitted point that was returned once and handed in again. */
export type SeedState = StoredState | 'resubmitted';

/** The events that lead there, as the machine would have written them (decisions have no actor in the seed). */
const HISTORY: Readonly<
  Record<SeedState, readonly (readonly [event: string, from: StoredState, to: StoredState])[]>
> = {
  draft: [],
  submitted: [['submit', 'draft', 'submitted']],
  returned: [
    ['submit', 'draft', 'submitted'],
    ['return', 'submitted', 'returned'],
  ],
  approved: [
    ['submit', 'draft', 'submitted'],
    ['approve', 'submitted', 'approved'],
  ],
  rejected: [
    ['submit', 'draft', 'submitted'],
    ['reject', 'submitted', 'rejected'],
  ],
  resubmitted: [
    ['submit', 'draft', 'submitted'],
    ['return', 'submitted', 'returned'],
    ['submit', 'returned', 'submitted'],
  ],
  withdrawn: [['withdraw', 'draft', 'withdrawn']],
  published: [
    ['submit', 'draft', 'submitted'],
    ['approve', 'submitted', 'approved'],
    ['publish', 'approved', 'published'],
  ],
};

/** The default note of a return or a rejection. */
export const SEED_NOTE = 'Doplňte prosím vyjádření.';

/**
 * A complete „Seminář“ of `email` (nothing left to fill in, so it can be handed in again) in the
 * state a journey starts from, with the events that lead there (a return or rejection carries
 * `note`). It is not exactly what the UI makes: a point that was ever handed in has
 * `earliest_monday` set (the Monday of the week two weeks from now, so it is the placement of every
 * such point) without the issue row the UI's first submit ensures, and decisions have no actor.
 * Returns its id.
 */
export async function seedPoint(
  email: string,
  title: string,
  state: SeedState,
  { note = SEED_NOTE, typeId = 'seminar' }: { note?: string; typeId?: string } = {},
): Promise<string> {
  return withClient(async (client) => {
    const stored = HISTORY[state].at(-1)?.[2] ?? 'draft';
    const handedIn = HISTORY[state].some(([event]) => event === 'submit');
    const { rows } = await client.query<{ id: string; author_id: string }>(
      `INSERT INTO points (kind, author_id, client_ref, type_id, state, title, event_date, opening, body,
                           bullets, statements, earliest_monday, submitted_at, hand_in_monday)
       SELECT 'report', u.id, gen_random_uuid(), $7,
              $3::point_state, $2, current_date + 30, 'Proběhl seminář.',
              '{"type":"doc","content":[]}'::jsonb, $4::jsonb, $5::jsonb,
              CASE WHEN $6 THEN date_trunc('week', current_date + 14)::date END,
              CASE WHEN $6 THEN now() END,
              CASE WHEN $6 THEN date_trunc('week', current_date + 14)::date END
         FROM users u WHERE u.email = $1
       RETURNING id, author_id`,
      [
        email,
        title,
        stored,
        JSON.stringify(PEOPLE_BULLETS),
        JSON.stringify(STATEMENTS),
        handedIn,
        typeId,
      ],
    );
    const made = rows[0];
    if (!made) throw new Error(`no user with the e-mail of this journey: ${email}`);
    const events = HISTORY[state];
    for (const [i, [event, from, to]] of events.entries()) {
      const byAuthor = event === 'submit' || event === 'withdraw';
      await client.query(
        `INSERT INTO point_events (point_id, actor_id, event, from_state, to_state, note, created_at)
         VALUES ($1, $2, $3, $4::point_state, $5::point_state, $6, now() - $7::int * interval '1 minute')`,
        [
          made.id,
          byAuthor ? made.author_id : null,
          event,
          from,
          to,
          event === 'return' || event === 'reject' ? note : null,
          events.length - i,
        ],
      );
    }
    return made.id;
  });
}

/** What the table holds of one point, for a test that checks what was stored. */
export async function readPoint(id: string): Promise<{
  version: number;
  state: string;
  title: string;
  opening: string;
  statements: { quote: string }[];
  bullets: {
    key: string;
    label: string;
    kind: string;
    text?: string;
    people?: { familyName: string }[];
  }[];
  eventDate: string | null;
}> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      'SELECT version, state, title, opening, statements, bullets, to_char(event_date, \'YYYY-MM-DD\') AS "eventDate" FROM points WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new Error(`no point ${id}`);
    return rows[0];
  });
}

/** The Monday a seeded point was first fit for (`earliest_monday`), as ISO. */
export async function earliestMondayOf(id: string): Promise<string> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ day: string }>(
      "SELECT to_char(earliest_monday, 'YYYY-MM-DD') AS day FROM points WHERE id = $1",
      [id],
    );
    if (!rows[0]?.day) throw new Error(`point ${id} was never handed in`);
    return rows[0].day;
  });
}

/** Withdraws a point behind the page's back, as a second tab would (the version rises with it). */
export async function withdrawBehindBack(id: string): Promise<void> {
  await withClient((client) =>
    client.query("UPDATE points SET state = 'withdrawn', version = version + 1 WHERE id = $1", [
      id,
    ]),
  );
}

/** Retitles a point behind the page's back, as another tab or a colleague would (the version rises with it). */
export async function retitleBehindBack(id: string, title: string): Promise<void> {
  await withClient((client) =>
    client.query('UPDATE points SET title = $2, version = version + 1 WHERE id = $1', [id, title]),
  );
}

/** Deletes these points (and their events): a test that shares its author with others clears only its own. */
export async function forgetPoints(ids: readonly string[]): Promise<void> {
  await withClient((client) =>
    client.query('DELETE FROM points WHERE id = ANY($1::uuid[])', [ids]),
  );
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

/** `count` bare drafts of this author (a title only), made in one statement: enough to need a second page of „Moje body“. */
export async function seedDrafts(email: string, count: number): Promise<void> {
  await withClient(async (client) => {
    const { rowCount } = await client.query(
      `INSERT INTO points (kind, author_id, client_ref, type_id, state, title, body, updated_at)
       SELECT 'report', u.id, gen_random_uuid(), 'seminar',
              'draft', 'Rozpracovaný bod ' || n, '{"type":"doc","content":[]}'::jsonb,
              date_trunc('milliseconds', now()) - n * interval '1 second'
         FROM users u, generate_series(1, $2::int) AS n WHERE u.email = $1`,
      [email, count],
    );
    if (rowCount !== count) throw new Error(`no user with the e-mail of this journey: ${email}`);
  });
}
