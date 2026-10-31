import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { saveList } from './index';

const world = setupWorld();
const { people, list, lists } = registryFixtures(world);

const make = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  docLabel: `seznam ${title}`,
  active: true,
  ...extra,
});

async function annex() {
  return list('Talentovaní studenti', { key: 'talent', purpose: 'annex1' });
}

describe('registry.saveList', () => {
  it('makes a point-4 list last, with a key from the title, and audits the key and all fields', async () => {
    const head = await people.headmaster();
    await list('Angličtina – certifikáty');
    const result = await world.run(saveList, world.as(head), make('Francouzština – certifikáty'));
    expect(result.ok && result.value).toMatchObject({ version: 1, changed: true });
    const all = await lists();
    expect(all.at(-1)).toMatchObject({
      key: 'francouzstina-certifikaty',
      title: 'Francouzština – certifikáty',
      purpose: 'point4',
      position: 2,
      active: true,
      version: 1,
    });
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.list_saved',
      targetType: 'registry_list',
      data: {
        meta: { listKey: 'francouzstina-certifikaty', fields: ['title', 'docLabel', 'active'] },
      },
    });
  });

  it('gives a second list with the same key stem a numbered key', async () => {
    const head = await people.headmaster();
    await list('Seznam', { key: 'seznam-a' });
    await list('Něco', { key: 'nic' });
    const result = await world.run(saveList, world.as(head), make('Šeznam A'));
    expect(result.ok).toBe(true);
    expect((await lists()).map((l) => l.key)).toContain('seznam-a-2');
  });

  it('renames and relabels a list under its version, auditing only the fields that changed', async () => {
    const head = await people.headmaster();
    const target = await list('Angličtina – certifikáty');
    const result = await world.run(saveList, world.as(head), {
      id: target.id,
      version: target.version,
      ...make('Angličtina – certifikáty 2'),
      docLabel: target.docLabel,
    });
    expect(result).toEqual({ ok: true, value: { id: target.id, version: 2, changed: true } });
    expect((await lists())[0]).toMatchObject({
      key: target.key,
      title: 'Angličtina – certifikáty 2',
    });
    expect((await world.inspect.audit()).at(-1)?.data).toMatchObject({
      meta: { listKey: target.key, fields: ['title'] },
    });
  });

  it('switches a point-4 list off and on', async () => {
    const head = await people.headmaster();
    const target = await list();
    const off = await world.run(saveList, world.as(head), {
      id: target.id,
      version: 1,
      ...make(target.title, { docLabel: target.docLabel, active: false }),
    });
    expect(off.ok && off.value.version).toBe(2);
    const on = await world.run(saveList, world.as(head), {
      id: target.id,
      version: 2,
      ...make(target.title, { docLabel: target.docLabel }),
    });
    expect(on.ok && on.value.version).toBe(3);
    expect((await lists())[0]?.active).toBe(true);
  });

  it('writes nothing for a save that changes nothing', async () => {
    const head = await people.headmaster();
    const target = await list();
    const result = await world.run(saveList, world.as(head), {
      id: target.id,
      version: 1,
      title: target.title,
      docLabel: target.docLabel,
      active: true,
    });
    expect(result).toEqual({ ok: true, value: { id: target.id, version: 1, changed: false } });
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('is a conflict for a stale version and wants a version for an existing list', async () => {
    const head = await people.headmaster();
    const target = await list();
    const body = make('Nový název');
    expect(
      await world.run(saveList, world.as(head), { id: target.id, version: 7, ...body }),
    ).toEqual({ ok: false, error: { code: 'conflict' } });
    expect(await world.run(saveList, world.as(head), { id: target.id, ...body })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { version: 'required' } },
    });
    expect((await lists())[0]?.title).toBe(target.title);
  });

  it('answers not-found for an unknown id', async () => {
    const head = await people.headmaster();
    const result = await world.run(saveList, world.as(head), {
      id: '0198f000-0000-7000-8000-00000000ffff',
      version: 1,
      ...make('Nic'),
    });
    expect(result).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  it('renames the Příloha 1 list but never switches it off', async () => {
    const head = await people.headmaster();
    const target = await annex();
    const off = await world.run(saveList, world.as(head), {
      id: target.id,
      version: 1,
      ...make(target.title, { docLabel: target.docLabel, active: false }),
    });
    expect(off).toEqual({ ok: false, error: { code: 'rule', rule: 'registry-list-fixed' } });
    const renamed = await world.run(saveList, world.as(head), {
      id: target.id,
      version: 1,
      ...make('Talenti', { docLabel: target.docLabel }),
    });
    expect(renamed.ok).toBe(true);
    expect((await lists())[0]).toMatchObject({ purpose: 'annex1', active: true, title: 'Talenti' });
  });

  it('refuses a title in use, new or renamed, and takes back its own title', async () => {
    const head = await people.headmaster();
    const first = await list('Angličtina – certifikáty');
    const second = await list('Němčina – certifikáty');
    const taken = { ok: false, error: { code: 'rule', rule: 'registry-list-taken' } };
    expect(await world.run(saveList, world.as(head), make(first.title))).toEqual(taken);
    expect(
      await world.run(saveList, world.as(head), {
        id: second.id,
        version: 1,
        ...make(first.title),
      }),
    ).toEqual(taken);
    expect(await lists()).toHaveLength(2);
  });

  it.each([
    ['an empty title', { title: ' ' }],
    ['a 121-character title', { title: 'T'.repeat(121) }],
    ['a 301-character label', { docLabel: 'L'.repeat(301) }],
    ['a purpose', { purpose: 'annex1' }],
    ['a key', { key: 'hacked' }],
    ['a missing active flag', { active: undefined }],
  ])('refuses %s as invalid input', async (_name, extra) => {
    const head = await people.headmaster();
    const result = await world.run(saveList, world.as(head), make('Nový', extra));
    expect(!result.ok && result.error.code).toBe('invalid-input');
    expect(await lists()).toHaveLength(0);
  });

  it('is for the headmaster alone', async () => {
    for (const who of [people.reviewer, people.submitter]) {
      const result = await world.run(saveList, world.as(await who()), make('Nový'));
      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
    expect(await lists()).toHaveLength(0);
  });
});
