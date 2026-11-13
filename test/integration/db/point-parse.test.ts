import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  system,
  type Principal,
  type Tx,
  type UserPrincipal,
} from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const SECRET = 'jana.novakova@ssps.cz';
const PERSON = `{"salutation":"pan","givenName":"Jan","familyName":"${SECRET}"}`;

let authorId = '';
const typeId = 'seminar';

const newAuthor = async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
  );
  return user!.id;
};

beforeAll(async () => {
  authorId = await newAuthor();
});

interface Jsonb {
  readonly body?: string;
  readonly bullets?: string;
  readonly statements?: string;
}

/** A draft as the owner, past the repository, with jsonb the contract refuses. */
const storeRow = async (jsonb: Jsonb, author = authorId) => {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO points (kind, author_id, client_ref, type_id, title, body, bullets, statements)
     VALUES ('report', $1, gen_random_uuid(), $2, 'Tajný název', $3, $4, $5) RETURNING id`,
    [
      author,
      typeId,
      jsonb.body ?? '{"type":"doc","content":[]}',
      jsonb.bullets ?? '[]',
      jsonb.statements ?? '[]',
    ],
  );
  return row!.id;
};

/** An author as a signed-in user: the people memory reads only one's own points. */
const asUser = (id: string): UserPrincipal => ({
  kind: 'user',
  actor: { id, role: 'submitter', status: 'active', isStudent: false },
  sessionId: randomUUID(),
  authTime: new Date(),
});

const read = <T>(
  run: (tx: Tx) => Promise<T>,
  mode: 'read' | 'write' = 'read',
  principal: Principal = system('cli:test'),
) =>
  database.app.transaction({ principal, now: new Date(), requestId: 'req-1' }, { mode }, run).then(
    () => null,
    (error: unknown) => error,
  );

const expectCodeOnly = (failure: unknown) => {
  expect(failure).toEqual(new DatabaseFailure('db.parse.points'));
  expect((failure as Error).cause).toBeUndefined();
  for (const text of [JSON.stringify(failure), String((failure as Error).message)]) {
    expect(text).not.toContain('novakova');
    expect(text).not.toContain('Tajný');
  }
};

/** Jsonb that names people and that the contract refuses. */
const PEOPLE_REFUSED: readonly (readonly [string, Jsonb])[] = [
  [
    'bullets with the same key twice',
    {
      bullets: `[${[1, 2].map(() => `{"key":"a","label":"${SECRET}","kind":"text","text":""}`).join(',')}]`,
    },
  ],
  [
    'a person with an unknown field',
    {
      bullets: `[{"key":"a","label":"A","kind":"people","order":"input","people":[{"note":"${SECRET}"}]}]`,
    },
  ],
  [
    'a statement without a quote',
    { statements: `[{"speaker":${PERSON},"speakerGenitive":"${SECRET}"}]` },
  ],
];

const memory = (id: string) =>
  read((tx) => tx.points.ownRecent({ limit: 30, since: new Date(0) }), 'read', asUser(id));

describe('a stored point the contract refuses', () => {
  it.each<readonly [string, Jsonb]>([
    ...PEOPLE_REFUSED,
    ['a body that is not rich text', { body: `{"type":"doc","content":[{"type":"${SECRET}"}]}` }],
  ])('fails get() and loadForWrite() with a code only: %s', async (_name, jsonb) => {
    const id = await storeRow(jsonb);
    expectCodeOnly(await read((tx) => tx.points.get(id)));
    expectCodeOnly(await read((tx) => tx.points.loadForWrite(id), 'write'));
  });

  it.each(PEOPLE_REFUSED)('fails the people memory with a code only: %s', async (_name, jsonb) => {
    const own = await newAuthor();
    await storeRow(jsonb, own);
    expectCodeOnly(await memory(own));
  });

  it('reads the people memory past a body it never selects', async () => {
    const own = await newAuthor();
    await storeRow({ body: `{"type":"doc","content":[{"type":"${SECRET}"}]}` }, own);
    expect(await memory(own)).toBeNull();
  });
});
