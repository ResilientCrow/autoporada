import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { readRegistry } from './index';

const world = setupWorld();
const { people, list, entry } = registryFixtures(world);

describe('registry.read', () => {
  it('lists every list in order with its active and never-printed counts, inactive ones too', async () => {
    const head = await people.headmaster();
    const english = await list('Angličtina – certifikáty');
    const german = await list('Němčina – certifikáty', { active: false });
    await list('Prázdný');
    await entry(english.id, 'Novák', { printed: true });
    await entry(english.id, 'Nová');
    await entry(english.id, 'Stará', { printed: true, removedAt: new Date() });
    await entry(german.id, 'Černý');
    const result = await world.run(readRegistry, world.as(head), {});
    expect(result.ok && result.value.current).toBeNull();
    expect(
      result.ok && result.value.lists.map((l) => [l.title, l.active, l.entries, l.fresh]),
    ).toEqual([
      ['Angličtina – certifikáty', true, 2, 1],
      ['Němčina – certifikáty', false, 1, 1],
      ['Prázdný', true, 0, 0],
    ]);
  });

  it('gives the entries of the list a key names in the document’s order, with the NOVÉ flag', async () => {
    const head = await people.headmaster();
    const target = await list('Angličtina – certifikáty');
    await entry(target.id, 'Žák', { givenName: 'Jan', classCode: '1.A', printed: true });
    await entry(target.id, 'Čermáková', { givenName: 'Eva', classCode: '2.B' });
    await entry(target.id, 'Adámek', { givenName: 'Petr', classCode: '1.A' });
    await entry(target.id, 'Odešlý', { classCode: '1.A', removedAt: new Date() });
    const result = await world.run(readRegistry, world.as(head), { key: target.key });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.current?.list).toMatchObject({ key: target.key, title: target.title });
    expect(result.value.current?.entries.map((e) => [e.familyName, e.classCode, e.isNew])).toEqual([
      ['Adámek', '1.A', true],
      ['Žák', '1.A', false],
      ['Čermáková', '2.B', true],
    ]);
    expect(result.value.current?.entries.every((e) => e.version === 1)).toBe(true);
    expect(result.value.lists[0]).toMatchObject({ entries: 3, fresh: 2 });
  });

  it('answers not-found for an unknown key and invalid input for a key that is too long', async () => {
    const head = await people.headmaster();
    expect(await world.run(readRegistry, world.as(head), { key: 'nic' })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    const long = await world.run(readRegistry, world.as(head), { key: 'k'.repeat(41) });
    expect(!long.ok && long.error.code).toBe('invalid-input');
  });

  it('is read by the headmaster and a reviewer, not by a submitter', async () => {
    const target = await list();
    await entry(target.id, 'Novák');
    for (const who of [people.headmaster, people.reviewer]) {
      const result = await world.run(readRegistry, world.as(await who()), { key: target.key });
      expect(result.ok && result.value.current?.entries).toHaveLength(1);
    }
    for (const user of [await people.submitter()]) {
      expect(await world.run(readRegistry, world.as(user), {})).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    }
  });
});
