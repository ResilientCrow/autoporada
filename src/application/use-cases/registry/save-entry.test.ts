import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { saveEntry } from './index';

const world = setupWorld();
const { people, list, entry, entryById, entriesOf } = registryFixtures(world);

const values = { givenName: 'Jana', familyName: 'Nováková', classCode: '1.A' };

async function start() {
  const head = await people.headmaster();
  const target = await list();
  const jana = await entry(target.id, 'Nováková', { givenName: 'Jana', classCode: '1.A' });
  const save = (input: Record<string, unknown>, by = head) =>
    world.run(saveEntry, world.as(by), { id: jana.id, version: jana.version, ...values, ...input });
  return { head, target, jana, save };
}

describe('registry.saveEntry', () => {
  it('saves the changed fields under the version and audits their names, not their values', async () => {
    const { head, jana, save } = await start();
    const result = await save({ givenName: 'Janička', classCode: ' 2.b ' });
    expect(result).toEqual({ ok: true, value: { version: 2, changed: true } });
    expect(await entryById(jana.id)).toMatchObject({
      givenName: 'Janička',
      familyName: 'Nováková',
      classCode: '2.B',
      version: 2,
    });
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.entry_saved',
      targetType: 'registry_entry',
      targetId: jana.id,
      data: { meta: { fields: ['givenName', 'classCode'] } },
    });
    expect(JSON.stringify(event?.data)).not.toMatch(/Janička|Nováková/);
  });

  it('writes nothing and audits nothing when nothing changed', async () => {
    const { jana, save } = await start();
    expect(await save({})).toEqual({ ok: true, value: { version: 1, changed: false } });
    expect((await entryById(jana.id))?.version).toBe(1);
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('is a conflict for a stale version, even for a save that would change nothing', async () => {
    const { jana, save } = await start();
    expect((await save({ givenName: 'Eva' })).ok).toBe(true);
    for (const input of [{ givenName: 'Ela' }, {}]) {
      expect(await save(input)).toEqual({ ok: false, error: { code: 'conflict' } });
    }
    expect((await entryById(jana.id))?.givenName).toBe('Eva');
  });

  it('refuses a name that equals another active student of the list, and keeps the entry', async () => {
    const { target, jana, save } = await start();
    await entry(target.id, 'Nová', { givenName: 'Eva', classCode: '1.A' });
    expect(await save({ givenName: 'Eva', familyName: 'Nová' })).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'registry-duplicate' },
    });
    expect(await entryById(jana.id)).toMatchObject({ givenName: 'Jana', version: 1 });
  });

  it('allows a name equal to a student of another list or to a removed one', async () => {
    const { target, save } = await start();
    const other = await list('Němčina – certifikáty');
    await entry(other.id, 'Nová', { givenName: 'Eva', classCode: '1.A' });
    await entry(target.id, 'Stará', { givenName: 'Eva', classCode: '1.A', removedAt: new Date() });
    expect((await save({ givenName: 'Eva', familyName: 'Nová' })).ok).toBe(true);
    expect((await save({ givenName: 'Eva', familyName: 'Stará', version: 2 })).ok).toBe(true);
  });

  it('answers not-found for an unknown or a removed entry', async () => {
    const { target, head } = await start();
    const gone = await entry(target.id, 'Odešlá', { removedAt: new Date() });
    for (const id of [gone.id, '0198f000-0000-7000-8000-00000000ffff']) {
      expect(await world.run(saveEntry, world.as(head), { id, version: 1, ...values })).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
    }
  });

  it.each([
    ['an empty name', { familyName: '  ' }],
    ['a class that is none', { classCode: 'hostující' }],
    ['no version', { version: undefined }],
    ['a list id', { listId: '0198f000-0000-7000-8000-00000000ffff' }],
  ])('refuses %s as invalid input', async (_name, input) => {
    const { jana, save } = await start();
    const result = await save(input);
    expect(!result.ok && result.error.code).toBe('invalid-input');
    expect((await entryById(jana.id))?.version).toBe(1);
  });

  it('is for the headmaster alone', async () => {
    const { target, save } = await start();
    for (const make of [people.reviewer, people.submitter]) {
      expect(await save({ givenName: 'Eva' }, await make())).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    }
    expect((await entriesOf(target.id))[0]?.givenName).toBe('Jana');
  });
});
