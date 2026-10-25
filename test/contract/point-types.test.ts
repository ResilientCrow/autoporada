import { describe, expect, it } from 'vitest';

import { system, type PointTypeRecord, type Tx } from '@/application/ports';

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
