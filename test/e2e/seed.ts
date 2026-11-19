/**
 * The users the e2e run starts with, inserted as the database owner. Identity
 * (tid, oid, name, e-mail) comes from the mock IdP's own file, so a persona is
 * defined once; first sign-ins then update the row instead of racing to make it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';

type Role = 'pending' | 'submitter' | 'reviewer' | 'headmaster';

type Salutation = 'pan' | 'pani' | 'slecna';

type RequestState = 'pending' | 'rejected' | 'cancelled' | 'blocked';

interface Persona {
  /** The `subject` of the mock IdP's mapping. */
  readonly subject: string;
  readonly role: Role;
  /** The answer to Arch's salutation question, written out per persona (the app never guesses it); `null` leaves it unanswered, so the question blocks the app (ADR 0072). */
  readonly salutation: Salutation | null;
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
  { subject: 'ucitel', role: 'pending', salutation: 'pani' },
  // Headmaster from the start, so the bootstrap never runs in e2e (unit and integration tests cover it).
  { subject: 'reditel', role: 'headmaster', salutation: 'pan' },
  // /pristup states: each is read by screens only, never mutated.
  {
    subject: 'ceka',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'pending', createdDaysAgo: 1 },
  },
  // Rejected two days ago: inside the cooldown.
  {
    subject: 'lhuta',
    role: 'pending',
    salutation: 'pani',
    request: { state: 'rejected', createdDaysAgo: 3, decidedDaysAgo: 2 },
  },
  // Rejected 40 days ago: past the cooldown, so the form is open again.
  {
    subject: 'po-lhute',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'rejected', createdDaysAgo: 41, decidedDaysAgo: 40 },
  },
  {
    subject: 'zrusena',
    role: 'pending',
    salutation: 'pani',
    request: { state: 'cancelled', createdDaysAgo: 2, decidedDaysAgo: 1 },
  },
  {
    subject: 'blokovany',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'blocked', createdDaysAgo: 6, decidedDaysAgo: 5 },
  },
  // Decided by journeys (approve, reject, two tabs): each persona is decided by one test only.
  {
    subject: 'schvalit',
    role: 'pending',
    salutation: 'pani',
    request: { state: 'pending', createdDaysAgo: 1 },
  },
  {
    subject: 'zamitnout',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'pending', createdDaysAgo: 1 },
  },
  {
    subject: 'spor',
    role: 'pending',
    salutation: 'pani',
    request: { state: 'pending', createdDaysAgo: 1 },
  },
  // The step-up actor (a second headmaster, so reditel stays the one who decides) and the user it changes.
  { subject: 'zastupce', role: 'headmaster', salutation: 'pani' },
  { subject: 'kolega', role: 'submitter', salutation: 'pan' },
  // Targets of users.spec.ts, one per test and never shared; the actor is zastupce.
  {
    subject: 'zablokovat',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'rejected', createdDaysAgo: 4, decidedDaysAgo: 3 },
  },
  { subject: 'ucet', role: 'submitter', salutation: 'pani' },
  { subject: 'povysit', role: 'submitter', salutation: 'pani' },
  { subject: 'typ', role: 'submitter', salutation: 'pan' },
  {
    subject: 'rozhodnout',
    role: 'pending',
    salutation: 'pan',
    request: { state: 'pending', createdDaysAgo: 1 },
  },
  // Journeys of access.spec.ts, one persona per test and no request to begin with.
  { subject: 'zadatel', role: 'pending', salutation: 'pan' },
  { subject: 'prazdny', role: 'pending', salutation: 'pan' },
  { subject: 'relace', role: 'pending', salutation: 'pani' },
  // Journeys of points.spec.ts and review.spec.ts: -d for the desktop project, -m for the mobile one,
  // since the projects run side by side and each journey needs people of its own.
  { subject: 'autor-d', role: 'submitter', salutation: 'pani' },
  { subject: 'autor-m', role: 'submitter', salutation: 'pan' },
  { subject: 'vraceny-d', role: 'submitter', salutation: 'pani' },
  { subject: 'vraceny-m', role: 'submitter', salutation: 'pan' },
  { subject: 'kontrolor-d', role: 'reviewer', salutation: 'pani' },
  { subject: 'kontrolor-m', role: 'reviewer', salutation: 'pan' },
  // autosave.spec.ts and editor.spec.ts: one author per project, whose points each test makes and clears by id.
  { subject: 'ukladani-d', role: 'submitter', salutation: 'pani' },
  { subject: 'ukladani-m', role: 'submitter', salutation: 'pan' },
  // m8-screens.spec.ts: the author of the listed states and the reviewer of the queue.
  { subject: 'ukazky-d', role: 'submitter', salutation: 'pani' },
  { subject: 'ukazky-m', role: 'submitter', salutation: 'pan' },
  { subject: 'prohlizi-d', role: 'reviewer', salutation: 'pani' },
  { subject: 'prohlizi-m', role: 'reviewer', salutation: 'pan' },
  // akce.spec.ts and its siblings, proposals.spec.ts, m8b-screens.spec.ts: -d and -m again. zapis writes the J3 akce,
  // uprav is akce-edit only (revise, retract), navrh is shared by akce-decide (its akce, cleared by forgetFutureOf) and
  // proposals (only refused there: a submitter may not propose, ADR 0052); rizeni is a headmaster who decides their
  // own akce (akce-decide), edits the proposal and is read-only in m8b-screens; revizor reviews and is the one author
  // of proposals (cleared by forgetPointsOf), ctenar only reads and obraz owns what the M8b screens show.
  { subject: 'zapis-d', role: 'submitter', salutation: 'pani' },
  { subject: 'zapis-m', role: 'submitter', salutation: 'pan' },
  { subject: 'uprav-d', role: 'submitter', salutation: 'pani' },
  { subject: 'uprav-m', role: 'submitter', salutation: 'pan' },
  { subject: 'revizor-d', role: 'reviewer', salutation: 'pani' },
  { subject: 'revizor-m', role: 'reviewer', salutation: 'pan' },
  { subject: 'rizeni-d', role: 'headmaster', salutation: 'pani' },
  { subject: 'rizeni-m', role: 'headmaster', salutation: 'pan' },
  { subject: 'ctenar-d', role: 'submitter', salutation: 'pani' },
  { subject: 'ctenar-m', role: 'submitter', salutation: 'pan' },
  { subject: 'navrh-d', role: 'submitter', salutation: 'pani' },
  { subject: 'navrh-m', role: 'submitter', salutation: 'pan' },
  { subject: 'obraz-d', role: 'submitter', salutation: 'pani' },
  { subject: 'obraz-m', role: 'submitter', salutation: 'pani' },
  // karta owns the ended akce of the report card.
  { subject: 'karta-d', role: 'submitter', salutation: 'pani' },
  { subject: 'karta-m', role: 'submitter', salutation: 'pan' },
  // archa writes through the Arch UI (branch arch-ui).
  { subject: 'archa-d', role: 'submitter', salutation: 'pan' },
  { subject: 'archa-m', role: 'submitter', salutation: 'pani' },
  // Has never answered the salutation question: the personas Arch asks (arch.spec.ts), one per project.
  { subject: 'osloveni-d', role: 'submitter', salutation: null },
  { subject: 'osloveni-m', role: 'submitter', salutation: null },
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
        'INSERT INTO users (tid, oid, display_name, email, role, salutation) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [tid, oid, name, email, persona.role, persona.salutation],
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
