import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { listPointTypes } from './index';

const world = setupWorld();

const list = (user: Parameters<typeof world.as>[0], input: unknown = {}) =>
  world.run(listPointTypes, world.as(user), input);

describe('pointTypes.list', () => {
  it('lists the active types in position order, with an id and a name only', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const second = await world.seed.pointType({ name: 'Exkurze', position: 2, titleGender: 'f' });
    const first = await world.seed.pointType({ name: 'Seminář', position: 1, titleGender: 'm' });
    expect(await list(author)).toEqual({
      ok: true,
      value: {
        types: [
          { id: first.id, name: 'Seminář' },
          { id: second.id, name: 'Exkurze' },
        ],
      },
    });
  });

  it('leaves out the types that are switched off', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const kept = await world.seed.pointType({ name: 'Seminář', position: 1 });
    await world.seed.pointType({ name: 'Soutěž', position: 2, active: false });
    const got = await list(author);
    expect(got).toEqual({ ok: true, value: { types: [{ id: kept.id, name: 'Seminář' }] } });
  });

  it('includes the locked „Jiné“', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const other = await world.seed.pointType({ name: 'Jiné', position: 9, locked: true });
    const got = await list(author);
    expect(got).toEqual({ ok: true, value: { types: [{ id: other.id, name: 'Jiné' }] } });
  });

  it('answers a student submitter too', async () => {
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    const type = await world.seed.pointType({ name: 'Seminář', position: 1 });
    expect(await list(student)).toEqual({
      ok: true,
      value: { types: [{ id: type.id, name: 'Seminář' }] },
    });
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
  ] as const)('refuses a %s user', async (_, seed) => {
    await world.seed.pointType({ name: 'Seminář', position: 1 });
    expect(await list(await world.seed.user(seed))).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('refuses a key it does not know', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    expect(await list(author, { everything: true })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  describe('with the retired types (includeInactive)', () => {
    const BULLET = { key: 'guests', label: 'Hosté', kind: 'people', required: false } as const;

    it('gives the headmaster every type in position order, with what the admin edits', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const off = await world.seed.pointType({
        name: 'Soutěž',
        position: 2,
        active: false,
        titleGender: 'f',
        defaultBullets: [BULLET],
      });
      const other = await world.seed.pointType({
        name: 'Jiné',
        position: 1,
        locked: true,
      });
      expect(await list(head, { includeInactive: true })).toEqual({
        ok: true,
        value: {
          types: [
            {
              id: other.id,
              name: 'Jiné',
              detail: {
                titleGender: null,
                defaultBullets: [],
                active: true,
                locked: true,
                position: 1,
                version: 1,
              },
            },
            {
              id: off.id,
              name: 'Soutěž',
              detail: {
                titleGender: 'f',
                defaultBullets: [BULLET],
                active: false,
                locked: false,
                position: 2,
                version: 1,
              },
            },
          ],
        },
      });
    });

    it.each(['submitter', 'reviewer'] as const)('refuses a %s', async (role) => {
      await world.seed.pointType({ name: 'Seminář', position: 1 });
      const user = await world.seed.user({ role });
      expect(await list(user, { includeInactive: true })).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });

    it('answers the headmaster with includeInactive false like anyone', async () => {
      const head = await world.seed.user({ role: 'headmaster' });
      const kept = await world.seed.pointType({ name: 'Seminář', position: 1 });
      await world.seed.pointType({ name: 'Soutěž', position: 2, active: false });
      expect(await list(head, { includeInactive: false })).toEqual({
        ok: true,
        value: { types: [{ id: kept.id, name: 'Seminář' }] },
      });
    });
  });

  it('cannot run for the system', async () => {
    await expect(world.run(listPointTypes, system('cli:test'), {})).rejects.toThrow(
      'pointTypes.list: runs as a signed-in user',
    );
  });
});
