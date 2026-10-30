import { describe, expect, inject, it } from 'vitest';

import {
  ConstraintViolation,
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type PointTypeRecord,
  type PointTypeValues,
  type Principal,
  type Tx,
} from '@/application/ports';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

const ORGANISERS = {
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  required: true,
  role: 'organisers',
} as const;
const RESULTS = { key: 'results', label: 'Výsledky', kind: 'text', required: false } as const;

const read = <T>(work: (tx: Tx) => Promise<T>) => world.tx(cli, work, 'read');
const names = (types: readonly PointTypeRecord[]) => types.map((t) => t.name);

describe('PointTypeRepo (port contract)', () => {
  it('lists every type, inactive ones too, in position order', async () => {
    await world.seed.pointType({ name: 'Soutěž', position: 3 });
    await world.seed.pointType({ name: 'Seminář', position: 1 });
    await world.seed.pointType({ name: 'Exkurze', position: 2, active: false });
    expect(names(await read((tx) => tx.pointTypes.list()))).toEqual([
      'Seminář',
      'Exkurze',
      'Soutěž',
    ]);
  });

  it('lists nothing when there are no types', async () => {
    expect(await read((tx) => tx.pointTypes.list())).toEqual([]);
  });

  it('returns the whole record, a null title gender and the bullets as stored', async () => {
    const seminar = await world.seed.pointType({
      name: 'Seminář',
      titleGender: 'm',
      defaultBullets: [ORGANISERS, RESULTS],
      position: 1,
    });
    const other = await world.seed.pointType({
      name: 'Jiné',
      titleGender: null,
      locked: true,
      position: 2,
    });
    expect(seminar).toEqual({
      id: seminar.id,
      name: 'Seminář',
      titleGender: 'm',
      defaultBullets: [ORGANISERS, RESULTS],
      active: true,
      locked: false,
      position: 1,
      version: 1,
    });
    expect(await read((tx) => tx.pointTypes.get(seminar.id))).toEqual(seminar);
    expect(await read((tx) => tx.pointTypes.get(other.id))).toEqual({
      ...other,
      titleGender: null,
      defaultBullets: [],
      locked: true,
    });
    expect(await read((tx) => tx.pointTypes.list())).toEqual([seminar, other]);
  });

  it('gives null for an unknown id', async () => {
    await world.seed.pointType({ name: 'Seminář', position: 1 });
    expect(
      await read((tx) => tx.pointTypes.get('00000000-0000-7000-8000-999999999999')),
    ).toBeNull();
  });

  it('is readable in a read transaction by every principal', async () => {
    const seeded = await world.seed.pointType({ name: 'Seminář', position: 1 });
    for (const role of ['pending', 'submitter', 'reviewer', 'headmaster'] as const) {
      const user = await world.seed.user({ role });
      const types = await world.tx(world.as(user), (tx) => tx.pointTypes.list(), 'read');
      expect(types, role).toEqual([seeded]);
    }
  });
});

const VALUES: PointTypeValues = {
  name: 'Beseda',
  titleGender: 'f',
  defaultBullets: [ORGANISERS, RESULTS],
  active: true,
  position: 7,
};

/** Writes as `by` and names the row in an audit event, as a use case would. */
const write = (work: (tx: Tx) => Promise<PointTypeRecord>, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const type = await work(tx);
    await tx.audit.record({
      action: 'point_type.changed',
      target: { type: 'point_type', id: type.id },
    });
    return type;
  });
const create = (values = VALUES, by: Principal = cli) =>
  write((tx) => tx.pointTypes.create(values), by);
const update = (
  type: PointTypeRecord,
  values: PointTypeValues,
  version = type.version,
  by: Principal = cli,
) => write((tx) => tx.pointTypes.update(type.id, version, values), by);

describe('PointTypeRepo writes (port contract)', () => {
  it('creates an unlocked type at version 1, which the list and get then show', async () => {
    const created = await create();
    expect(created).toEqual({ id: created.id, ...VALUES, locked: false, version: 1 });
    expect(await read((tx) => tx.pointTypes.get(created.id))).toEqual(created);
    expect(await read((tx) => tx.pointTypes.list())).toEqual([created]);
  });

  it('refuses a second type with the same name, by the constraint name', async () => {
    await create();
    const failure = await create({ ...VALUES, position: 8 }).catch((error: unknown) => error);
    expect(failure).toEqual(new ConstraintViolation('point_types_name_key'));
    expect(await read((tx) => tx.pointTypes.list())).toHaveLength(1);
  });

  it('changes every value against the expected version and raises it by one', async () => {
    const created = await create();
    const changed = await update(created, {
      name: 'Workshop',
      titleGender: null,
      defaultBullets: [],
      active: false,
      position: 2,
    });
    expect(changed).toEqual({
      id: created.id,
      name: 'Workshop',
      titleGender: null,
      defaultBullets: [],
      active: false,
      locked: false,
      position: 2,
      version: 2,
    });
    expect(await read((tx) => tx.pointTypes.get(created.id))).toEqual(changed);
  });

  it('keeps a type locked whatever the update says', async () => {
    const other = await world.seed.pointType({ name: 'Jiné', position: 9, locked: true });
    const changed = await update(other, { ...VALUES, name: 'Ostatní' });
    expect(changed).toMatchObject({ name: 'Ostatní', locked: true, version: 2 });
  });

  it('refuses an update on a stale version or an unknown id', async () => {
    const created = await create();
    await update(created, { ...VALUES, position: 8 });
    await expect(update(created, { ...VALUES, position: 9 })).rejects.toBeInstanceOf(StaleVersion);
    await expect(
      write((tx) => tx.pointTypes.update('00000000-0000-7000-8000-999999999999', 1, VALUES)),
    ).rejects.toBeInstanceOf(StaleVersion);
    expect(await read((tx) => tx.pointTypes.get(created.id))).toMatchObject({ position: 8 });
  });

  it("refuses a rename onto another type's name, by the constraint name", async () => {
    await create();
    const second = await create({ ...VALUES, name: 'Workshop' });
    const failure = await update(second, VALUES).catch((error: unknown) => error);
    expect(failure).toEqual(new ConstraintViolation('point_types_name_key'));
  });

  it('refuses to switch the locked type off, by the constraint name', async () => {
    const other = await world.seed.pointType({ name: 'Jiné', position: 9, locked: true });
    const failure = await update(other, { ...VALUES, name: 'Jiné', active: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toEqual(new DatabaseFailure('db.constraint.point_types_locked_active'));
  });

  it('lets only someone who may manage the types write them', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const head = await world.seed.user({ role: 'headmaster' });
    const created = await create(VALUES, world.as(head));
    for (const user of [author, reviewer]) {
      await expect(create({ ...VALUES, name: 'Jiný' }, world.as(user))).rejects.toBeInstanceOf(
        ScopeViolation,
      );
      await expect(update(created, VALUES, 1, world.as(user))).rejects.toBeInstanceOf(
        ScopeViolation,
      );
    }
    expect(await read((tx) => tx.pointTypes.list())).toEqual([created]);
  });

  it('writes nothing in a read transaction', async () => {
    await expect(read((tx) => tx.pointTypes.create(VALUES))).rejects.toBeInstanceOf(
      DatabaseFailure,
    );
  });
});

describe.runIf(inject('world') === 'fake')('point type audit coverage in the fake world', () => {
  it('fails a commit that wrote a type no audit event names', async () => {
    const unaudited = world.tx(cli, (tx) => tx.pointTypes.create(VALUES));
    await expect(unaudited).rejects.toBeInstanceOf(UnauditedWrite);
  });
});
