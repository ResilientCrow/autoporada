import { describe, expect, it } from 'vitest';

import { createArchStore } from '@/infra/db/arch';

import { setupTestDatabase } from '../../support/database';

/** The arch store's read of the functions (ADR 0072 item 4): in order, a user with none absent. */
const database = setupTestDatabase();

async function user(name: string): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name) VALUES (gen_random_uuid(), gen_random_uuid(), $1) RETURNING id`,
    [name],
  );
  return row!.id;
}
const give = (id: string, position: number, head: string, complement: string | null) =>
  database.owner(
    `INSERT INTO user_functions (user_id, head, complement, position) VALUES ($1, $2, $3, $4)`,
    [id, head, complement, position],
  );

describe('createArchStore.functions', () => {
  it('reads each user’s list in position order, for everyone or for the ids asked', async () => {
    const a = await user('A');
    const b = await user('B');
    const none = await user('C');
    // Inserted out of order: the position decides.
    await give(a, 1, 'clen', null);
    await give(a, 0, 'zastupce', 'pro majetek');
    await give(b, 0, 'vedouci', 'IT oddělení');
    const store = createArchStore(database.db);

    const all = await store.functions(null);
    expect(all.get(a)).toEqual([
      { head: 'zastupce', complement: 'pro majetek' },
      { head: 'clen', complement: null },
    ]);
    expect(all.get(b)).toEqual([{ head: 'vedouci', complement: 'IT oddělení' }]);
    expect(all.has(none)).toBe(false);

    const own = await store.functions([b]);
    expect([...own.keys()]).toEqual([b]);
    expect((await store.functions([])).size).toBe(0);
  });
});
