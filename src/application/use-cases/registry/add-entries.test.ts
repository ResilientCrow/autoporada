import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { addEntries } from './index';

const world = setupWorld();
const { people, list, entry, entriesOf } = registryFixtures(world);

const row = (givenName: string, familyName: string, classCode = '1.A') => ({
  givenName,
  familyName,
  classCode,
});
const add = async (rows: unknown, listId?: string) => {
  const head = await people.headmaster();
  const target = listId ?? (await list()).id;
  return {
    head,
    target,
    result: await world.run(addEntries, world.as(head), { listId: target, rows }),
  };
};

describe('registry.addEntries', () => {
  it('adds the rows in one go, names the list by its key and counts the rows in the audit', async () => {
    const head = await people.headmaster();
    const target = await list();
    const result = await world.run(addEntries, world.as(head), {
      listId: target.id,
      rows: [row('Jana', 'Nováková'), row('Jan', 'Novák', ' 1.b ')],
    });
    expect(result).toEqual({ ok: true, value: { added: 2 } });
    const entries = await entriesOf(target.id);
    expect(entries.map((e) => [e.givenName, e.familyName, e.classCode, e.version]).sort()).toEqual([
      ['Jan', 'Novák', '1.B', 1],
      ['Jana', 'Nováková', '1.A', 1],
    ]);
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.entries_added',
      targetType: 'registry_list',
      targetId: target.id,
      data: { meta: { listKey: target.key, count: 2 } },
    });
    expect(JSON.stringify(event?.data)).not.toMatch(/Jan|Nováko|Novák/);
  });

  it('refuses a student already on the list, adding nothing', async () => {
    const target = await list();
    await entry(target.id, 'Nováková', { givenName: 'Jana', classCode: '1.A' });
    const { result } = await add([row('Eva', 'Nová'), row('Jana', 'Nováková')], target.id);
    expect(result).toEqual({ ok: false, error: { code: 'rule', rule: 'registry-duplicate' } });
    expect(await entriesOf(target.id)).toHaveLength(1);
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('refuses the same student twice in the rows', async () => {
    const target = await list();
    const { result } = await add([row('Jan', 'Novák'), row('Jan', 'Novák')], target.id);
    expect(result).toEqual({ ok: false, error: { code: 'rule', rule: 'registry-duplicate' } });
    expect(await entriesOf(target.id)).toHaveLength(0);
  });

  it('takes the same name in another class, on another list, or once removed', async () => {
    const target = await list();
    const other = await list('Němčina – certifikáty');
    await entry(target.id, 'Novák', { givenName: 'Jan', classCode: '1.A' });
    await entry(target.id, 'Nová', { givenName: 'Eva', classCode: '1.A', removedAt: new Date() });
    expect((await add([row('Jan', 'Novák', '1.B')], target.id)).result.ok).toBe(true);
    expect((await add([row('Jan', 'Novák')], other.id)).result.ok).toBe(true);
    expect((await add([row('Eva', 'Nová')], target.id)).result.ok).toBe(true);
  });

  it('answers not-found for an unknown list', async () => {
    const { result } = await add([row('Jan', 'Novák')], '0198f000-0000-7000-8000-00000000ffff');
    expect(result).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  it.each([
    ['no rows', []],
    ['an empty name', [row('', 'Novák')]],
    ['a name of 61 characters', [row('J'.repeat(61), 'Novák')]],
    ['a class that is none', [row('Jan', 'Novák', 'hostující')]],
    ['a newline in a name', [row('Jan\nKarel', 'Novák')]],
    ['an unknown field', [{ ...row('Jan', 'Novák'), listId: 'x' }]],
    ['201 rows', Array.from({ length: 201 }, (_, i) => row(`Jan${i}`, 'Novák'))],
  ])('refuses %s as invalid input', async (_name, rows) => {
    const target = await list();
    const { result } = await add(rows, target.id);
    expect(!result.ok && result.error.code).toBe('invalid-input');
    expect(await entriesOf(target.id)).toHaveLength(0);
  });

  it('takes 200 rows, names with spaces trimmed', async () => {
    const target = await list();
    const rows = Array.from({ length: 200 }, (_, i) => row(` Jan${i} `, 'Novák'));
    const { result } = await add(rows, target.id);
    expect(result).toEqual({ ok: true, value: { added: 200 } });
    expect((await entriesOf(target.id))[0]?.givenName).toMatch(/^Jan\d+$/);
  });

  it('strips control characters from a name before it is stored', async () => {
    const target = await list();
    const { result } = await add([row('Jan\u0007', 'No\u202evák')], target.id);
    expect(result.ok).toBe(true);
    expect((await entriesOf(target.id)).map((e) => [e.givenName, e.familyName])).toEqual([
      ['Jan', 'Novák'],
    ]);
  });

  it('is for the headmaster alone', async () => {
    const target = await list();
    for (const make of [people.reviewer, people.submitter]) {
      const user = await make();
      const result = await world.run(addEntries, world.as(user), {
        listId: target.id,
        rows: [row('Jan', 'Novák')],
      });
      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
    expect(await entriesOf(target.id)).toHaveLength(0);
  });
});
