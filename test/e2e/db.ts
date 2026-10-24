/**
 * Writes the e2e database directly, as its owner, for what the UI cannot do
 * to a test's own session. Keyed by the cookie of that test, so parallel tests
 * never touch each other's sessions.
 */
import { createHash } from 'node:crypto';

import { Client } from 'pg';

import { databaseUrl } from '../support/template-db';

/** This run's database, rebuilt by global-setup.ts. */
export const E2E_DATABASE = 'autoporada_e2e';

/** What the sessions table stores: the SHA-256 of the cookie value (see src/server/auth/tokens.ts). */
const digestOf = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest();

/**
 * Ends the session of this cookie. It changes neither role nor status, so no
 * trigger signs anyone else out. Returns how many rows went; a test expects 1.
 */
export async function endSession(token: string): Promise<number> {
  const client = new Client({ connectionString: databaseUrl(E2E_DATABASE) });
  await client.connect();
  try {
    const result = await client.query('DELETE FROM sessions WHERE token_hash = $1', [
      digestOf(token),
    ]);
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}
