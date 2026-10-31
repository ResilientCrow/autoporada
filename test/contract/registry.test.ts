import { describe, expect, it } from 'vitest';

import {
  ConstraintViolation,
  ScopeViolation,
  StaleVersion,
  system,
  type AuditTarget,
  type Principal,
  type Tx,
} from '@/application/ports';

import { registryFixtures } from '../support/registry';
import { setupWorld } from '../support/world';

const world = setupWorld();
const { list, entry } = registryFixtures(world);
const cli = system('cli:test');

const read = <T>(work: (tx: Tx) => Promise<T>, by: Principal = cli) => world.tx(by, work, 'read');
/** A write, with the audit event naming the rows it changed, as a use case would. */
const write = <T>(
  work: (tx: Tx) => Promise<T>,
  targets: (result: T) => readonly AuditTarget[],
  by: Principal = cli,
) =>
  world.tx(by, async (tx) => {
    const result = await work(tx);
    await tx.audit.record({
      action: 'registry.entries_added',
      target: null,
      related: targets(result),
    });
    return result;
  });
const entryTarget = (e: { id: string }): AuditTarget => ({ type: 'registry_entry', id: e.id });
const listTarget = (l: { id: string }): AuditTarget => ({ type: 'registry_list', id: l.id });
const values = (givenName: string, familyName: string, classCode = '1.A') => ({
  givenName,
  familyName,
  classCode,
});
const addTo = (listId: string, ...rows: ReturnType<typeof values>[]) =>
  write(
    (tx) => tx.registry.addEntries(listId, rows),
    (added) => added.map(entryTarget),
  );
/** An unregistered constraint, as ADR 0022 reports it, in both worlds. */
const refusedBy = (constraint: string) => ({ sqlstate: `db.constraint.${constraint}` });
const duplicate = new ConstraintViolation('registry_entries_active_key');

describe('RegistryRepo (port contract)', () => {
  describe('lists', () => {
    it('has none to begin with', async () => {
      expect(await read((tx) => tx.registry.lists())).toEqual([]);
      expect(await read((tx) => tx.registry.counts())).toEqual([]);
    });

    it('gives every list, inactive ones too, by position, and finds one by id or key', async () => {
      const b = await list('B', { position: 2 });
      const a = await list('A', { position: 1, active: false });
      expect((await read((tx) => tx.registry.lists())).map((l) => l.title)).toEqual(['A', 'B']);
      expect(await read((tx) => tx.registry.list(b.id))).toEqual(b);
      expect(await read((tx) => tx.registry.listByKey(a.key))).toEqual(a);
      expect(
        await read((tx) => tx.registry.list('0198f000-0000-7000-8000-00000000ffff')),
      ).toBeNull();
      expect(await read((tx) => tx.registry.listByKey('nic'))).toBeNull();
    });

    it('creates a point-4 list last, active, at version 1', async () => {
      await list('A', { position: 4 });
      const created = await write(
        (tx) =>
          tx.registry.createList('b-list', { title: 'B', docLabel: 'seznam B', active: true }),
        (l) => [listTarget(l)],
      );
      expect(created).toMatchObject({
        key: 'b-list',
        title: 'B',
        purpose: 'point4',
        position: 5,
        active: true,
        version: 1,
      });
      expect(await read((tx) => tx.registry.list(created.id))).toEqual(created);
    });

    it('creates the first list at position 1', async () => {
      const created = await write(
        (tx) => tx.registry.createList('a', { title: 'A', docLabel: 'a', active: true }),
        (l) => [listTarget(l)],
      );
      expect(created.position).toBe(1);
    });

    it('refuses a title in use with ConstraintViolation, in both worlds', async () => {
      await list('A');
      await expect(
        write(
          (tx) => tx.registry.createList('another', { title: 'A', docLabel: 'a', active: true }),
          (l) => [listTarget(l)],
        ),
      ).rejects.toEqual(new ConstraintViolation('registry_lists_title_key'));
    });

    it('refuses a key in use, a key that is not a slug and texts of the wrong length', async () => {
      await list('A', { key: 'a' });
      const make = (key: string, title: string, docLabel = 'x') =>
        write(
          (tx) => tx.registry.createList(key, { title, docLabel, active: true }),
          (l) => [listTarget(l)],
        );
      await expect(make('a', 'B')).rejects.toEqual(
        new ConstraintViolation('registry_lists_key_key'),
      );
      await expect(make('Not A Slug', 'B')).rejects.toMatchObject(refusedBy('registry_lists_key'));
      await expect(make('b', '')).rejects.toMatchObject(refusedBy('registry_lists_lengths'));
      await expect(make('b', 'B', 'x'.repeat(301))).rejects.toMatchObject(
        refusedBy('registry_lists_lengths'),
      );
    });

    it('updates a list under its version and raises it', async () => {
      const a = await list('A');
      const updated = await write(
        (tx) => tx.registry.updateList(a.id, 1, { title: 'A2', docLabel: 'label', active: false }),
        (l) => [listTarget(l)],
      );
      expect(updated).toEqual({
        ...a,
        title: 'A2',
        docLabel: 'label',
        active: false,
        version: 2,
      });
      expect(await read((tx) => tx.registry.list(a.id))).toEqual(updated);
    });

    it('throws StaleVersion for another version or an unknown list, and changes nothing', async () => {
      const a = await list('A');
      const values = { title: 'A2', docLabel: 'x', active: true };
      const update = (id: string, version: number) =>
        write(
          (tx) => tx.registry.updateList(id, version, values),
          (l) => [listTarget(l)],
        );
      await expect(update(a.id, 2)).rejects.toBeInstanceOf(StaleVersion);
      await expect(update('0198f000-0000-7000-8000-00000000ffff', 1)).rejects.toBeInstanceOf(
        StaleVersion,
      );
      expect(await read((tx) => tx.registry.list(a.id))).toEqual(a);
    });

    it('refuses to rename a list to a title in use', async () => {
      await list('A');
      const b = await list('B');
      await expect(
        write(
          (tx) => tx.registry.updateList(b.id, 1, { title: 'A', docLabel: 'x', active: true }),
          (l) => [listTarget(l)],
        ),
      ).rejects.toEqual(new ConstraintViolation('registry_lists_title_key'));
    });

    it('refuses to switch the annex 1 list off', async () => {
      const annex = await list('Talenti', { purpose: 'annex1' });
      await expect(
        write(
          (tx) =>
            tx.registry.updateList(annex.id, 1, { title: 'Talenti', docLabel: 'x', active: false }),
          (l) => [listTarget(l)],
        ),
      ).rejects.toMatchObject(refusedBy('registry_lists_annex1_active'));
    });

    it('writes the positions 1..n in the order given and raises the versions', async () => {
      const a = await list('A', { position: 3 });
      const b = await list('B', { position: 7 });
      const c = await list('C', { position: 8 });
      await write(
        (tx) => tx.registry.orderLists([c.id, a.id, b.id]),
        () => [a, b, c].map(listTarget),
      );
      const after = await read((tx) => tx.registry.lists());
      expect(after.map((l) => [l.title, l.position, l.version])).toEqual([
        ['C', 1, 2],
        ['A', 2, 2],
        ['B', 3, 2],
      ]);
    });
  });

  describe('entries', () => {
    it('adds entries at version 1, counted per list with the never-printed ones apart', async () => {
      const a = await list('A');
      const b = await list('B');
      await list('C');
      const added = await addTo(a.id, values('Jana', 'Nováková'), values('Jan', 'Novák', '1.B'));
      expect(added).toHaveLength(2);
      expect(added[0]).toMatchObject({
        listId: a.id,
        givenName: 'Jana',
        familyName: 'Nováková',
        classCode: '1.A',
        addedAt: world.clock.now(),
        removedAt: null,
        archivedYear: null,
        firstPublishedIssueId: null,
        version: 1,
      });
      await entry(b.id, 'Černý', { printed: true });
      await entry(b.id, 'Bílý');
      await entry(b.id, 'Starý', { removedAt: new Date() });
      const counts = await read((tx) => tx.registry.counts());
      expect([...counts].sort((x, y) => x.listId.localeCompare(y.listId))).toEqual(
        [
          { listId: a.id, active: 2, fresh: 2 },
          { listId: b.id, active: 2, fresh: 1 },
        ].sort((x, y) => x.listId.localeCompare(y.listId)),
      );
    });

    it('gives only the active entries of the list, and any entry by id', async () => {
      const a = await list('A');
      const b = await list('B');
      const kept = await entry(a.id, 'Novák');
      const gone = await entry(a.id, 'Odešlý', { removedAt: new Date() });
      await entry(b.id, 'Jiný');
      expect((await read((tx) => tx.registry.entries(a.id))).map((e) => e.id)).toEqual([kept.id]);
      expect(await read((tx) => tx.registry.entry(gone.id))).toEqual(gone);
      expect(
        await read((tx) => tx.registry.entry('0198f000-0000-7000-8000-00000000ffff')),
      ).toBeNull();
    });

    it('adds nothing for no rows', async () => {
      const a = await list('A');
      expect(await addTo(a.id)).toEqual([]);
    });

    it('refuses a student already active on the list, and all rows of the call with it', async () => {
      const a = await list('A');
      await addTo(a.id, values('Jana', 'Nováková'));
      await expect(addTo(a.id, values('Eva', 'Nová'), values('Jana', 'Nováková'))).rejects.toEqual(
        duplicate,
      );
      expect(await read((tx) => tx.registry.entries(a.id))).toHaveLength(1);
    });

    it('refuses the same student twice in one call', async () => {
      const a = await list('A');
      await expect(addTo(a.id, values('Jan', 'Novák'), values('Jan', 'Novák'))).rejects.toEqual(
        duplicate,
      );
      expect(await read((tx) => tx.registry.entries(a.id))).toHaveLength(0);
    });

    it('compares the stored text exactly: another case, class or list is another student', async () => {
      const a = await list('A');
      const b = await list('B');
      await addTo(a.id, values('Jan', 'Novák'));
      await addTo(a.id, values('jan', 'Novák'), values('Jan', 'Novák', '1.B'));
      await addTo(b.id, values('Jan', 'Novák'));
      expect(await read((tx) => tx.registry.entries(a.id))).toHaveLength(3);
    });

    it('lets a removed student’s name be added again', async () => {
      const a = await list('A');
      await entry(a.id, 'Novák', { givenName: 'Jan', removedAt: new Date() });
      expect(await addTo(a.id, values('Jan', 'Novák'))).toHaveLength(1);
    });

    it('refuses names and classes of the wrong length', async () => {
      const a = await list('A');
      for (const row of [
        values('', 'Novák'),
        values('J'.repeat(61), 'Novák'),
        values('Jan', 'N'.repeat(61)),
        values('Jan', 'Novák', ''),
        values('Jan', 'Novák', '123456789'),
      ]) {
        await expect(addTo(a.id, row)).rejects.toMatchObject(refusedBy('registry_entries_lengths'));
      }
    });

    it('refuses an unknown list', async () => {
      await expect(
        addTo('0198f000-0000-7000-8000-00000000ffff', values('Jan', 'Novák')),
      ).rejects.toMatchObject(refusedBy('registry_entries_list_id_registry_lists_id_fk'));
    });

    it('updates an entry under its version and raises it', async () => {
      const a = await list('A');
      const [jana] = await addTo(a.id, values('Jana', 'Nováková'));
      const updated = await write(
        (tx) => tx.registry.updateEntry(jana?.id ?? '', 1, values('Janička', 'Nováková', '2.B')),
        (e) => [entryTarget(e)],
      );
      expect(updated).toMatchObject({ givenName: 'Janička', classCode: '2.B', version: 2 });
      expect(await read((tx) => tx.registry.entry(updated.id))).toEqual(updated);
    });

    it('throws StaleVersion for another version, a removed entry and an unknown one', async () => {
      const a = await list('A');
      const jana = await entry(a.id, 'Nováková');
      const gone = await entry(a.id, 'Odešlá', { removedAt: new Date() });
      const update = (id: string, version: number) =>
        write(
          (tx) => tx.registry.updateEntry(id, version, values('Eva', 'Nová')),
          (e) => [entryTarget(e)],
        );
      await expect(update(jana.id, 2)).rejects.toBeInstanceOf(StaleVersion);
      await expect(update(gone.id, 1)).rejects.toBeInstanceOf(StaleVersion);
      await expect(update('0198f000-0000-7000-8000-00000000ffff', 1)).rejects.toBeInstanceOf(
        StaleVersion,
      );
      expect(await read((tx) => tx.registry.entry(jana.id))).toEqual(jana);
    });

    it('refuses an update that makes the entry equal to another active one', async () => {
      const a = await list('A');
      await entry(a.id, 'Nová', { givenName: 'Eva' });
      const jana = await entry(a.id, 'Nováková', { givenName: 'Jana' });
      await expect(
        write(
          (tx) => tx.registry.updateEntry(jana.id, 1, values('Eva', 'Nová')),
          (e) => [entryTarget(e)],
        ),
      ).rejects.toEqual(duplicate);
      expect(await read((tx) => tx.registry.entry(jana.id))).toEqual(jana);
    });

    it('keeps an entry equal to itself when updated with its own values', async () => {
      const a = await list('A');
      const jana = await entry(a.id, 'Nováková', { givenName: 'Jana' });
      const updated = await write(
        (tx) => tx.registry.updateEntry(jana.id, 1, values('Jana', 'Nováková')),
        (e) => [entryTarget(e)],
      );
      expect(updated.version).toBe(2);
    });
  });

  describe('removeEntry', () => {
    const remove = (id: string) =>
      write(
        (tx) => tx.registry.removeEntry(id),
        () => [{ type: 'registry_entry', id }],
      );

    it('deletes a never-printed entry', async () => {
      const a = await list('A');
      const jana = await entry(a.id, 'Nováková');
      expect(await remove(jana.id)).toBe('deleted');
      expect(await read((tx) => tx.registry.entry(jana.id))).toBeNull();
    });

    it('keeps a printed one, removed at the clock and one version up', async () => {
      const a = await list('A');
      const jana = await entry(a.id, 'Nováková', { printed: true });
      expect(await remove(jana.id)).toBe('archived');
      expect(await read((tx) => tx.registry.entry(jana.id))).toEqual({
        ...jana,
        removedAt: world.clock.now(),
        version: 2,
      });
      expect(await read((tx) => tx.registry.entries(a.id))).toEqual([]);
    });

    it('gives null for an entry already removed and for an unknown one', async () => {
      const a = await list('A');
      const gone = await entry(a.id, 'Odešlá', { removedAt: new Date(), printed: true });
      expect(await remove(gone.id)).toBeNull();
      expect(await remove('0198f000-0000-7000-8000-00000000ffff')).toBeNull();
      expect(await read((tx) => tx.registry.entry(gone.id))).toEqual(gone);
    });
  });

  describe('archiveLists', () => {
    const archive = (ids: string[], year: string) =>
      write(
        (tx) => tx.registry.archiveLists(ids, year),
        () => [],
      );

    it('deletes the never-printed entries and archives the printed ones of the lists named', async () => {
      const a = await list('A');
      const b = await list('B');
      const fresh = await entry(a.id, 'Nová');
      const printed = await entry(a.id, 'Novák', { printed: true });
      const other = await entry(b.id, 'Jiný', { printed: true });
      const already = await entry(a.id, 'Dřívější', {
        printed: true,
        removedAt: new Date('2025-06-01T00:00:00Z'),
        archivedYear: '2024/2025',
      });
      const result = await world.tx(cli, async (tx) => {
        const done = await tx.registry.archiveLists([a.id], '2025/2026');
        await tx.audit.record({
          action: 'registry.school_year_archived',
          target: listTarget(a),
          related: [fresh, printed].map(entryTarget),
        });
        return done;
      });
      expect(result).toEqual({ archived: 1, deleted: 1 });
      expect(await read((tx) => tx.registry.entry(fresh.id))).toBeNull();
      expect(await read((tx) => tx.registry.entry(printed.id))).toEqual({
        ...printed,
        removedAt: world.clock.now(),
        archivedYear: '2025/2026',
        version: 2,
      });
      expect(await read((tx) => tx.registry.entry(other.id))).toEqual(other);
      expect(await read((tx) => tx.registry.entry(already.id))).toEqual(already);
      expect(await read((tx) => tx.registry.lists())).toHaveLength(2);
    });

    it('does nothing for lists with no active entries', async () => {
      const a = await list('A');
      expect(await archive([a.id], '2025/2026')).toEqual({ archived: 0, deleted: 0 });
    });
  });

  describe('who may', () => {
    it('lets the system, a reviewer and the headmaster read, and not a submitter', async () => {
      const a = await list('A');
      await entry(a.id, 'Novák');
      for (const role of ['reviewer', 'headmaster'] as const) {
        const by = world.as(await world.seed.user({ role }));
        expect(await read((tx) => tx.registry.entries(a.id), by)).toHaveLength(1);
        expect(await read((tx) => tx.registry.lists(), by)).toHaveLength(1);
      }
      const submitter = world.as(await world.seed.user({ role: 'submitter' }));
      for (const call of [
        (tx: Tx) => tx.registry.lists(),
        (tx: Tx) => tx.registry.list(a.id),
        (tx: Tx) => tx.registry.listByKey(a.key),
        (tx: Tx) => tx.registry.counts(),
        (tx: Tx) => tx.registry.entries(a.id),
        (tx: Tx) => tx.registry.entry('0198f000-0000-7000-8000-00000000ffff'),
      ] as readonly ((tx: Tx) => Promise<unknown>)[]) {
        await expect(read(call, submitter)).rejects.toBeInstanceOf(ScopeViolation);
      }
    });

    it('lets only the headmaster write, and a reviewer not even archive', async () => {
      const a = await list('A');
      const jana = await entry(a.id, 'Nováková');
      const head = world.as(await world.seed.user({ role: 'headmaster' }));
      const reviewer = world.as(await world.seed.user({ role: 'reviewer' }));
      const attempts: ((tx: Tx) => Promise<unknown>)[] = [
        (tx) => tx.registry.addEntries(a.id, [values('Eva', 'Nová')]),
        (tx) => tx.registry.updateEntry(jana.id, 1, values('Eva', 'Nová')),
        (tx) => tx.registry.removeEntry(jana.id),
        (tx) => tx.registry.archiveLists([a.id], '2025/2026'),
        (tx) => tx.registry.createList('b', { title: 'B', docLabel: 'b', active: true }),
        (tx) => tx.registry.updateList(a.id, 1, { title: 'A2', docLabel: 'a', active: true }),
        (tx) => tx.registry.orderLists([a.id]),
      ];
      for (const attempt of attempts) {
        await expect(world.tx(reviewer, attempt)).rejects.toBeInstanceOf(ScopeViolation);
      }
      expect(await read((tx) => tx.registry.entry(jana.id))).toEqual(jana);
      expect(
        await write(
          (tx) => tx.registry.addEntries(a.id, [values('Eva', 'Nová')]),
          (added) => added.map(entryTarget),
          head,
        ),
      ).toHaveLength(1);
    });
  });
});
