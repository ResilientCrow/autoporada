import { beforeEach, describe, expect, it } from 'vitest';

import { ConstraintViolation, system, type Tx } from '@/application/ports';
import { addEntries, saveList } from '@/application/use-cases/registry';

import { registryFixtures } from '../../support/registry';
import { setupWorld } from '../../support/world';

const world = setupWorld();
const { list, entry, people } = registryFixtures(world);
const cli = system('cli:test');

/** A failing statement as the owner, with the constraint PostgreSQL names. */
async function ownerRefusal(sql: string, params: unknown[] = []) {
  try {
    await world.pg?.owner(sql, params);
  } catch (error) {
    return error as { code?: string; constraint?: string; message: string };
  }
  throw new Error('expected the statement to fail');
}

describe('registry guards, in PostgreSQL (migrations 0031 and 0032)', () => {
  describe('the duplicate race', () => {
    const jana = { givenName: 'Jana', familyName: 'Nováková', classCode: '1.A' };

    it('gives one winner when two transactions add the same student at once', async () => {
      const target = await list();
      const add = () =>
        world.tx(cli, async (tx: Tx) => {
          const added = await tx.registry.addEntries(target.id, [jana]);
          await tx.audit.record({
            action: 'registry.entries_added',
            target: null,
            related: added.map((e) => ({ type: 'registry_entry', id: e.id })),
          });
          return added;
        });
      const results = await Promise.allSettled([add(), add()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected');
      expect(lost?.status === 'rejected' && lost.reason).toEqual(
        new ConstraintViolation('registry_entries_active_key'),
      );
      expect(await world.tx(cli, (tx) => tx.registry.entries(target.id), 'read')).toHaveLength(1);
    });

    it('answers registry-duplicate to the loser of a race through the use case', async () => {
      const head = await people.headmaster();
      const target = await list();
      const run = () => world.run(addEntries, world.as(head), { listId: target.id, rows: [jana] });
      const results = await Promise.all([run(), run()]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({
        ok: false,
        error: { code: 'rule', rule: 'registry-duplicate' },
      });
    });

    it('answers registry-list-taken to the loser of a race on a title', async () => {
      const head = await people.headmaster();
      const run = () =>
        world.run(saveList, world.as(head), {
          title: 'Francouzština',
          docLabel: 'seznam francouzštiny',
          active: true,
        });
      const results = await Promise.all([run(), run()]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({
        ok: false,
        error: { code: 'rule', rule: 'registry-list-taken' },
      });
    });

    it('frees a name when its entry is removed and refuses it again once re-added twice', async () => {
      const target = await list();
      await entry(target.id, 'Nováková', { givenName: 'Jana', removedAt: new Date() });
      await entry(target.id, 'Nováková', { givenName: 'Jana' });
      await expect(entry(target.id, 'Nováková', { givenName: 'Jana' })).rejects.toMatchObject({
        constraint: 'registry_entries_active_key',
      });
    });
  });

  describe('Příloha 1', () => {
    it('allows one annex1 list and refuses a second, by its partial unique index', async () => {
      await list('Talenti', { purpose: 'annex1' });
      await expect(list('Druhá příloha', { purpose: 'annex1' })).rejects.toMatchObject({
        code: '23505',
        constraint: 'registry_lists_one_annex1',
      });
    });

    it('refuses an annex1 list that is not active, on insert and on update', async () => {
      await expect(list('Talenti', { purpose: 'annex1', active: false })).rejects.toMatchObject({
        code: '23514',
        constraint: 'registry_lists_annex1_active',
      });
      const annex = await list('Talenti', { purpose: 'annex1' });
      expect(
        await ownerRefusal(
          `UPDATE registry_lists SET active = false, version = version + 1 WHERE id = $1`,
          [annex.id],
        ),
      ).toMatchObject({ code: '23514', constraint: 'registry_lists_annex1_active' });
    });

    it('allows any number of point4 lists, switched off or not', async () => {
      await list('A', { active: false });
      await list('B');
      await list('C');
    });
  });

  describe('the archived check', () => {
    let listId: string | undefined;
    const insert = (removedAt: Date | null, archivedYear: string | null) => async () => {
      listId ??= (await list()).id;
      return entry(listId, 'Novák', { removedAt, archivedYear, givenName: `Jan${Math.random()}` });
    };
    beforeEach(() => {
      listId = undefined;
    });

    it('refuses an archived year on an entry that is not removed', async () => {
      await expect(insert(null, '2025/2026')()).rejects.toMatchObject({
        code: '23514',
        constraint: 'registry_entries_archived',
      });
    });

    it('refuses an archived year that is not YYYY/YYYY', async () => {
      for (const year of ['2025', '2025-2026', '25/26', '2025/2026 ', 'minule']) {
        await expect(insert(new Date(), year)(), year).rejects.toMatchObject({
          constraint: 'registry_entries_archived',
        });
      }
    });

    it('takes an archived year on a removed entry, and a removed entry with none', async () => {
      expect((await insert(new Date(), '2025/2026')()).archivedYear).toBe('2025/2026');
      expect((await insert(new Date(), null)()).archivedYear).toBeNull();
    });

    it('refuses to clear removed_at of an archived entry', async () => {
      const target = await list();
      const archived = await entry(target.id, 'Novák', {
        removedAt: new Date(),
        archivedYear: '2025/2026',
      });
      expect(
        await ownerRefusal(
          `UPDATE registry_entries SET removed_at = NULL, version = version + 1 WHERE id = $1`,
          [archived.id],
        ),
      ).toMatchObject({ constraint: 'registry_entries_archived' });
    });
  });

  describe('versions and ownership', () => {
    it('refuses an update that does not raise the version by one, in both tables', async () => {
      const target = await list();
      const student = await entry(target.id, 'Novák');
      for (const sql of [
        `UPDATE registry_lists SET title = 'Jiný' WHERE id = $1`,
        `UPDATE registry_lists SET title = 'Jiný', version = version + 2 WHERE id = $1`,
      ]) {
        expect(await ownerRefusal(sql, [target.id]), sql).toMatchObject({
          message: expect.stringContaining('version must rise by one'),
        });
      }
      expect(
        await ownerRefusal(`UPDATE registry_entries SET class_code = '2.B' WHERE id = $1`, [
          student.id,
        ]),
      ).toMatchObject({ message: expect.stringContaining('version must rise by one') });
    });

    it('keeps a list that has students: the foreign key restricts its deletion', async () => {
      const target = await list();
      await entry(target.id, 'Novák');
      expect(
        await ownerRefusal(`DELETE FROM registry_lists WHERE id = $1`, [target.id]),
      ).toMatchObject({
        code: '23001',
        constraint: 'registry_entries_list_id_registry_lists_id_fk',
      });
    });

    it('gives the worker no access to the registry tables', async () => {
      const target = await list();
      await entry(target.id, 'Novák');
      for (const read of [
        (tx: Tx) => tx.registry.lists(),
        (tx: Tx) => tx.registry.entries(target.id),
      ] as readonly ((tx: Tx) => Promise<unknown>)[]) {
        await expect(world.tx(system('job:test'), read, 'read')).resolves.toBeDefined();
        await expect(
          world.workerDb.transaction(
            { principal: system('job:test'), now: world.clock.now(), requestId: 'test' },
            { mode: 'read' },
            read,
          ),
        ).rejects.toBeDefined();
      }
    });
  });
});
