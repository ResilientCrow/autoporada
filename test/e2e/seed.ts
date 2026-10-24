/**
 * The users the e2e run starts with, inserted as the database owner. Identity
 * (tid, oid, name, e-mail) comes from the mock IdP's own file, so a persona is
 * defined once; first sign-ins then update the row instead of racing to make it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';

type Role = 'pending' | 'submitter' | 'reviewer' | 'headmaster';

interface Persona {
  /** The `subject` of the mock IdP's mapping. */
  readonly subject: string;
  readonly role: Role;
}

const PERSONAS: readonly Persona[] = [
  // Read-only screens and the pending notice; never mutated.
  { subject: 'ucitel', role: 'pending' },
  // Headmaster from the start, so the bootstrap never runs in e2e (unit and integration tests cover it).
  { subject: 'reditel', role: 'headmaster' },
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
    for (const persona of PERSONAS) {
      const { tid, oid, name, email } = identityOf(persona.subject);
      await client.query(
        'INSERT INTO users (tid, oid, display_name, email, role) VALUES ($1, $2, $3, $4, $5)',
        [tid, oid, name, email, persona.role],
      );
    }
  } finally {
    await client.end();
  }
}
