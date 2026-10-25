import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';

const database = setupTestDatabase();

// Registered before the harness's own beforeEach, so it runs first and leaves the state a
// previous test would have: a claim in the send window and a closed gate.
beforeEach(async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name, email, role, status)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Harness', $1, 'reviewer', 'active') RETURNING id`,
    [`${randomUUID()}@example.org`],
  );
  await database.owner(
    `INSERT INTO mail_ledger (dedupe_key, template, recipient_id, subject_id, state, attempts, claimed_at)
     VALUES ('leftover', 'access.approved', $1, $1, 'sent', 1, now())`,
    [user?.id],
  );
  await database.owner(
    `UPDATE mail_gate SET not_before = now() + interval '1 hour', code = 'throttled.429'`,
  );
});
const jobs = setupJobs(database);

describe('the jobs harness', () => {
  it('starts every test with an empty send window and an open gate', async () => {
    expect(await database.owner('SELECT 1 FROM mail_ledger')).toEqual([]);
    expect(await database.owner('SELECT not_before, code FROM mail_gate')).toEqual([
      { not_before: null, code: null },
    ]);
  });

  it('sets the queue timing from production on every call, not on top of the last test', async () => {
    const limit = async () =>
      (
        await database.owner<{ retry_limit: number }>(
          `SELECT retry_limit FROM pgboss.queue WHERE name = 'mail.send'`,
        )
      )[0]?.retry_limit;
    await jobs.timing({ retryLimit: 3 });
    expect(await limit()).toBe(3);
    await jobs.timing();
    expect(await limit()).toBe(15);
  });
});
