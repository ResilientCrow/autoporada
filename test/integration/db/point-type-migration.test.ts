import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR } from '@/infra/migrate';

import { setupTestDatabase } from '../../support/database';

/**
 * Migration 0058 turns `points.type_id` from a reference to an editable type into a key of the
 * list fixed in code (ADR 0064). The template is already migrated, so each test first puts back
 * the shape 0058 found: the table, its foreign key, the enum and a uuid column, without the CHECK.
 */
const MIGRATION = readFileSync(join(MIGRATIONS_DIR, '0058_fixed_point_types.sql'), 'utf8');

const database = setupTestDatabase();
let authorId = '';

beforeAll(async () => {
  const [user] = await database.owner<{ id: string }>(
    `INSERT INTO users (tid, oid, display_name)
     VALUES (gen_random_uuid(), gen_random_uuid(), 'Jana Nováková') RETURNING id`,
  );
  authorId = user!.id;
});

beforeEach(() =>
  database.owner(`
    DELETE FROM points;
    ALTER TABLE points DROP CONSTRAINT IF EXISTS points_type;
    ALTER TABLE points DROP CONSTRAINT IF EXISTS points_type_id_point_types_id_fk;
    DROP TABLE IF EXISTS point_types;
    DROP TYPE IF EXISTS title_gender;
    CREATE TYPE title_gender AS ENUM ('m', 'f', 'n', 'pl', 'npl');
    CREATE TABLE point_types (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      name text NOT NULL UNIQUE,
      title_gender title_gender
    );
    ALTER TABLE points ALTER COLUMN type_id SET DATA TYPE uuid USING type_id::uuid;
    ALTER TABLE points ADD CONSTRAINT points_type_id_point_types_id_fk
      FOREIGN KEY (type_id) REFERENCES point_types (id);`),
);

async function typeNamed(name: string): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO point_types (name) VALUES ($1) RETURNING id`,
    [name],
  );
  return row!.id;
}

/** A draft as a deployed database holds it: a report names its type's uuid, a proposal none. */
async function draft(kind: 'report' | 'finance', typeId: string | null): Promise<string> {
  const [row] = await database.owner<{ id: string }>(
    `INSERT INTO points (kind, author_id, client_ref, type_id, body)
     VALUES ($1, $2, $3, $4, '{"type":"doc","content":[]}') RETURNING id`,
    [kind, authorId, randomUUID(), typeId],
  );
  return row!.id;
}

const migrate = () => database.owner(MIGRATION);

const pointOf = async (id: string) => {
  const [row] = await database.owner<{ type_id: string | null; version: number }>(
    `SELECT type_id, version FROM points WHERE id = $1`,
    [id],
  );
  return row!;
};

const SEEDED = [
  ['Seminář', 'seminar'],
  ['Exkurze', 'exkurze'],
  ['Soutěž', 'soutez'],
  ['Přednáška', 'prednaska'],
  ['Projektový den', 'projektovy'],
  ['Jiné', 'jine'],
] as const;

describe('migration 0058: report types by key', () => {
  it('maps a report of each seeded type to its key, one version up', async () => {
    const points = new Map<string, string>();
    for (const [name, key] of SEEDED) points.set(key, await draft('report', await typeNamed(name)));

    await migrate();

    for (const [key, id] of points) expect(await pointOf(id)).toEqual({ type_id: key, version: 2 });
  });

  it('maps a type the headmaster added, or a renamed seeded one, to „Jiné“', async () => {
    const added = await draft('report', await typeNamed('Nový typ'));
    const renamed = await draft('report', await typeNamed('Seminář pro rodiče'));

    await migrate();

    expect(await pointOf(added)).toEqual({ type_id: 'jine', version: 2 });
    expect(await pointOf(renamed)).toEqual({ type_id: 'jine', version: 2 });
  });

  it('leaves a proposal, which has no type, untouched', async () => {
    const finance = await draft('finance', null);

    await migrate();

    expect(await pointOf(finance)).toEqual({ type_id: null, version: 1 });
  });

  it('drops the table and the enum, and refuses a key outside the list', async () => {
    await typeNamed('Nový typ');
    await migrate();

    const left = await database.owner<{ table: string | null; enum: string | null }>(
      `SELECT to_regclass('public.point_types')::text AS table,
              to_regtype('public.title_gender')::text AS enum`,
    );
    expect(left).toEqual([{ table: null, enum: null }]);
    await expect(draft('report', 'Seminář')).rejects.toMatchObject({ constraint: 'points_type' });
  });
});
