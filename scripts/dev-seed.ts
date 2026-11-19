// `pnpm dev:seed`: the two dev accounts of the mock IdP, ready to use. „Ředitel“ is the headmaster
// and „Učitelka“ a staff member with approved access, so neither waits for a request to be decided.
// Identity (tid, oid, name, e-mail) comes from docker/dev/mock-oauth2.json, as in test/e2e/seed.ts.
// Rerunning it only resets those two roles and tiers. Development databases only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const ACCOUNTS = [
  { subject: 'reditel', role: 'headmaster', tier: 'reditel' },
  { subject: 'ucitel', role: 'submitter', tier: 'ucitel' },
] as const;

interface Claims {
  readonly tid: string;
  readonly oid: string;
  readonly name: string;
  readonly email: string;
}

const MOCK_IDP = fileURLToPath(new URL('../docker/dev/mock-oauth2.json', import.meta.url));

function claimsOf(subject: string): Claims {
  const config = JSON.parse(readFileSync(MOCK_IDP, 'utf8')) as {
    tokenCallbacks: { requestMappings: { match: string; claims: Claims }[] }[];
  };
  const found = config.tokenCallbacks
    .flatMap((callback) => callback.requestMappings)
    .find((mapping) => mapping.match === subject);
  if (!found) throw new Error(`dev:seed: no mock IdP mapping for "${subject}"`);
  return found.claims;
}

const environment = process.env['APP_ENV'] ?? 'development';
const databaseUrl = process.env['DATABASE_URL'];
if (environment !== 'development') {
  console.error(`dev:seed: refused, APP_ENV is "${environment}" (development only)`);
  process.exit(1);
}
if (!databaseUrl) {
  console.error('dev:seed: DATABASE_URL is missing (copy .env.example to .env)');
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN');
  for (const { subject, role, tier } of ACCOUNTS) {
    const { tid, oid, name, email } = claimsOf(subject);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (tid, oid, display_name, email, role, tier) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT users_entra_key
       DO UPDATE SET role = EXCLUDED.role, tier = EXCLUDED.tier, status = 'active', version = users.version + 1
       RETURNING id`,
      [tid, oid, name, email, role, tier],
    );
    // A request left open from an earlier try would still sit in the headmaster's queue.
    await client.query(
      `UPDATE access_requests SET state = 'cancelled', decided_at = now(), version = version + 1
       WHERE user_id = $1 AND state = 'pending'`,
      [rows[0]!.id],
    );
    console.log(`${name} (${subject}): ${role}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
