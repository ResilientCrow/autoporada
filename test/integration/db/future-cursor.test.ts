import { beforeAll, describe, expect, it } from 'vitest';

import type { FutureCursor, UserPrincipal } from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();

let author: UserPrincipal;

beforeAll(async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
  );
  author = {
    kind: 'user',
    actor: { id: user!.id, role: 'submitter', status: 'active', isStudent: false },
    sessionId: 'test',
    authTime: new Date(),
  };
});

/** A draft written by SQL (a trigger, a default or a helper would do the same) at a microsecond instant. */
async function insertItem(updatedAt: string): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO future_items (kind, author_id, client_ref, updated_at)
     VALUES ('akce', (SELECT id FROM users LIMIT 1), gen_random_uuid(), $1)
     RETURNING id`,
    [updatedAt],
  );
  return row!.id;
}

/** The list page by page, one row each, every cursor taken from the row before it as the app does. */
async function walk(): Promise<readonly string[]> {
  const ids: string[] = [];
  let before: FutureCursor | undefined;
  for (let page = 0; page < 10; page += 1) {
    const rows = await database.app.transaction(
      { principal: author, now: new Date(), requestId: 'test' },
      { mode: 'read' },
      (tx) => tx.futureItems.list(1, before),
    );
    const [row] = rows;
    if (!row) break;
    ids.push(row.id);
    before = { id: row.id, updatedAt: row.updatedAt };
  }
  return ids;
}

describe('the list of future items, paged by a cursor', () => {
  it('shows every row once when SQL wrote instants finer than a millisecond', async () => {
    const newest = await insertItem('2026-10-20 10:00:00.000900+00');
    const middle = await insertItem('2026-10-20 10:00:00.000500+00');
    const oldest = await insertItem('2026-10-20 10:00:00.000100+00');

    const walked = await walk();

    expect([...walked].sort()).toEqual([newest, middle, oldest].sort());
  });
});
