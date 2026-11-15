import { beforeAll, describe, expect, it } from 'vitest';

import { DatabaseFailure, system, type Principal, type Tx } from '@/application/ports';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();
const SECRET = 'jana.novakova@ssps.cz';
const PERSON = `{"salutation":"pan","givenName":"Jan","familyName":"${SECRET}"}`;

let authorId = '';

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
    `INSERT INTO points (kind, author_id, client_ref, title, body, bullets, statements)
     VALUES ('report', $1, gen_random_uuid(), 'Tajný název', $2, $3, $4) RETURNING id`,
    [
      author,
      jsonb.body ?? '{"type":"doc","content":[]}',
      jsonb.bullets ?? '[]',
      jsonb.statements ?? '[]',
    ],
  );
  return row!.id;
};

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

describe('a stored point the contract refuses', () => {
  it.each<readonly [string, Jsonb]>([
    ...PEOPLE_REFUSED,
    ['a body that is not rich text', { body: `{"type":"doc","content":[{"type":"${SECRET}"}]}` }],
  ])('fails get() and loadForWrite() with a code only: %s', async (_name, jsonb) => {
    const id = await storeRow(jsonb);
    expectCodeOnly(await read((tx) => tx.points.get(id)));
    expectCodeOnly(await read((tx) => tx.points.loadForWrite(id), 'write'));
  });
});
