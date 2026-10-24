/**
 * The users the e2e run starts with, inserted as the database owner. Identity
 * (tid, oid, name, e-mail) comes from the mock IdP's own file, so a persona is
 * defined once; first sign-ins then update the row instead of racing to make it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';

type Role = 'pending' | 'submitter' | 'reviewer' | 'headmaster';

type RequestState = 'pending' | 'rejected' | 'cancelled' | 'blocked';

interface Persona {
  /** The `subject` of the mock IdP's mapping. */
  readonly subject: string;
  readonly role: Role;
  /** An access request the user starts with; the offsets are days before the run (decided only for a decision). */
  readonly request?: {
    readonly state: RequestState;
    readonly createdDaysAgo: number;
    readonly decidedDaysAgo?: number;
  };
}

const REASON = 'Chci posílat zprávy o akcích třídy.';

const PERSONAS: readonly Persona[] = [
  // Read-only screens and the pending notice; never mutated.
  { subject: 'ucitel', role: 'pending' },
  // Headmaster from the start, so the bootstrap never runs in e2e (unit and integration tests cover it).
  { subject: 'reditel', role: 'headmaster' },
  // /pristup states: each is read by screens only, never mutated.
  { subject: 'ceka', role: 'pending', request: { state: 'pending', createdDaysAgo: 1 } },
  // Rejected two days ago: inside the cooldown.
  {
    subject: 'lhuta',
    role: 'pending',
    request: { state: 'rejected', createdDaysAgo: 3, decidedDaysAgo: 2 },
  },
  // Rejected 40 days ago: past the cooldown, so the form is open again.
  {
    subject: 'po-lhute',
    role: 'pending',
    request: { state: 'rejected', createdDaysAgo: 41, decidedDaysAgo: 40 },
  },
  {
    subject: 'zrusena',
    role: 'pending',
    request: { state: 'cancelled', createdDaysAgo: 2, decidedDaysAgo: 1 },
  },
  {
    subject: 'blokovany',
    role: 'pending',
    request: { state: 'blocked', createdDaysAgo: 6, decidedDaysAgo: 5 },
  },
  // Decided by journeys (approve, reject, two tabs): each persona is decided by one test only.
  { subject: 'schvalit', role: 'pending', request: { state: 'pending', createdDaysAgo: 1 } },
  { subject: 'zamitnout', role: 'pending', request: { state: 'pending', createdDaysAgo: 1 } },
  { subject: 'spor', role: 'pending', request: { state: 'pending', createdDaysAgo: 1 } },
  // The step-up actor (a second headmaster, so reditel stays the one who decides) and the user it changes.
  { subject: 'zastupce', role: 'headmaster' },
  { subject: 'kolega', role: 'submitter' },
  // Targets of users.spec.ts, one per test and never shared; the actor is zastupce.
  {
    subject: 'zablokovat',
    role: 'pending',
    request: { state: 'rejected', createdDaysAgo: 4, decidedDaysAgo: 3 },
  },
  { subject: 'ucet', role: 'submitter' },
  { subject: 'povysit', role: 'submitter' },
  { subject: 'typ', role: 'submitter' },
  { subject: 'rozhodnout', role: 'pending', request: { state: 'pending', createdDaysAgo: 1 } },
  // Journeys of access.spec.ts, one persona per test and no request to begin with.
  { subject: 'zadatel', role: 'pending' },
  { subject: 'prazdny', role: 'pending' },
  { subject: 'relace', role: 'pending' },
];

interface Mapping {
  readonly match: string;
  readonly claims: { tid: string; oid: string; name: string; email: string };
}

function identityOf(subject: string): Mapping['claims'] {
  const file = join(process.cwd(), 'docker/dev/mock-oauth2.json');
  const config = JSON.parse(readFileSync(file, 'utf8')) as {
    tokenCallbacks: { requestMappings: Mapping[] }[];
  };
  const found = config.tokenCallbacks
    .flatMap((callback) => callback.requestMappings)
    .find((mapping) => mapping.match === subject);
  if (!found) throw new Error(`seed: no mock IdP mapping for "${subject}"`);
  return found.claims;
}

export async function seed(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let headmaster = '';
    for (const persona of PERSONAS) {
      const { tid, oid, name, email } = identityOf(persona.subject);
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO users (tid, oid, display_name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [tid, oid, name, email, persona.role],
      );
      const userId = rows[0]!.id;
      if (persona.role === 'headmaster') headmaster = userId;
      const { request } = persona;
      if (!request) continue;
      // Decisions are the headmaster's, who is listed before every persona with a decision.
      const decided = request.decidedDaysAgo !== undefined;
      await client.query(
        `INSERT INTO access_requests (user_id, reason, state, decided_by, decided_at, created_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() - $5::int * interval '1 day' END,
                 now() - $6::int * interval '1 day')`,
        [
          userId,
          REASON,
          request.state,
          decided && request.state !== 'cancelled' ? headmaster : null,
          request.decidedDaysAgo ?? null,
          request.createdDaysAgo,
        ],
      );
    }
  } finally {
    await client.end();
  }
}
