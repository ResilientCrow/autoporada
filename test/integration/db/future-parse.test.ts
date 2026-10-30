import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { DatabaseFailure, type Tx, type UserPrincipal } from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const SECRET = 'jana.novakova@ssps.cz';

let authorId = '';

beforeAll(async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
  );
  authorId = user!.id;
});

/** A draft as the owner, past the repository, with a `responsible` the contract refuses. */
const storeItem = async (responsible: string) => {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO future_items (kind, author_id, client_ref, title, responsible)
     VALUES ('akce', $1, gen_random_uuid(), 'Tajný název', $2) RETURNING id`,
    [authorId, responsible],
  );
  return row!.id;
};

const asAuthor: UserPrincipal = {
  kind: 'user',
  actor: { id: '', role: 'submitter', status: 'active', isStudent: false },
  sessionId: randomUUID(),
  authTime: new Date(),
};

const run = <T>(work: (tx: Tx) => Promise<T>, mode: 'read' | 'write' = 'read') =>
  database.app
    .transaction(
      {
        principal: { ...asAuthor, actor: { ...asAuthor.actor, id: authorId } },
        now: new Date(),
        requestId: 'req-1',
      },
      { mode },
      work,
    )
    .then(
      () => null,
      (error: unknown) => error,
    );

const expectCodeOnly = (failure: unknown) => {
  expect(failure).toEqual(new DatabaseFailure('db.parse.future_items'));
  expect((failure as Error).cause).toBeUndefined();
  for (const text of [JSON.stringify(failure), String((failure as Error).message)]) {
    expect(text).not.toContain('novakova');
    expect(text).not.toContain('Tajný');
  }
};

describe('a stored future item whose responsible the contract refuses', () => {
  it.each<readonly [string, string]>([
    ['an unknown verb', `{"verb":"řídí","people":[]}`],
    ['a stray key', `{"verb":"vede","people":[],"note":"${SECRET}"}`],
    [
      'a person without a family name',
      `{"verb":"vede","people":[{"salutation":null,"givenName":"${SECRET}"}]}`,
    ],
  ])('fails get(), loadForWrite() and list() with a code only: %s', async (_name, responsible) => {
    const id = await storeItem(responsible);
    expectCodeOnly(await run((tx) => tx.futureItems.get(id)));
    expectCodeOnly(await run((tx) => tx.futureItems.loadForWrite(id), 'write'));
    expectCodeOnly(await run((tx) => tx.futureItems.list(50)));
  });
});
