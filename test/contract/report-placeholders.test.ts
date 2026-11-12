import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type Principal,
  type Tx,
} from '@/application/ports';
import { POINT_LIMITS } from '@/domain/report';

import { issueFixtures } from '../support/issues';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

const read = <T>(work: (tx: Tx) => Promise<T>, by: Principal = cli) => world.tx(by, work, 'read');
const many = (ids: readonly string[], by: Principal = cli) =>
  read((tx) => tx.reportPlaceholders.many(ids), by);
/** A save in its own transaction; the write is audited as the use case will. */
const save = (id: string, paragraph: string, version: number, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const saved = await tx.reportPlaceholders.save(id, paragraph, version);
    await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
    return saved;
  });
const confirm = (id: string, original: string, version: number, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const confirmed = await tx.reportPlaceholders.confirm(id, original, version);
    await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
    return confirmed;
  });
const remove = (id: string, version: number, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const removed = await tx.reportPlaceholders.remove(id, version);
    await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
    return removed;
  });

async function akce() {
  const author = await world.seed.user({ role: 'submitter' });
  return fixtures.future({ author });
}

describe('ReportPlaceholderRepo (port contract)', () => {
  it('has no row for an akce to begin with, and for no akce at all', async () => {
    const id = await akce();
    expect(await many([id])).toEqual([]);
    expect(await many([])).toEqual([]);
  });

  it('stores a first paragraph at version 1 and gives it back as written', async () => {
    const id = await akce();
    expect(await save(id, 'Dne 1. 11. 2026 proběhla akce Výlet.', 0)).toBe(1);
    expect(await many([id])).toEqual([
      {
        futureItemId: id,
        paragraph: 'Dne 1. 11. 2026 proběhla akce Výlet.',
        confirmedOriginal: null,
        version: 1,
      },
    ]);
  });

  it('replaces the paragraph when the version is current, and the version rises by one', async () => {
    const id = await akce();
    await save(id, 'První.', 0);
    expect(await save(id, 'Druhá.', 1)).toBe(2);
    expect(await save(id, 'Třetí.', 2)).toBe(3);
    expect(await many([id])).toEqual([
      { futureItemId: id, paragraph: 'Třetí.', confirmedOriginal: null, version: 3 },
    ]);
  });

  it('gives null to a stale save and keeps the stored paragraph', async () => {
    const id = await akce();
    await save(id, 'První.', 0);
    expect(await save(id, 'Opožděná.', 0)).toBeNull();
    expect(await save(id, 'Opožděná.', 5)).toBeNull();
    expect((await many([id]))[0]?.paragraph).toBe('První.');
  });

  it('gives one winner to two first saves', async () => {
    const id = await akce();
    expect(await save(id, 'Vítěz.', 0)).toBe(1);
    expect(await save(id, 'Poražený.', 0)).toBeNull();
    expect((await many([id]))[0]?.paragraph).toBe('Vítěz.');
  });

  it('keeps every akce apart and answers only for the ones asked about', async () => {
    const one = await akce();
    const two = await akce();
    const three = await akce();
    await save(one, 'Jedna.', 0);
    await save(two, 'Dvě.', 0);
    const got = await many([one, three]);
    expect(got).toEqual([
      { futureItemId: one, paragraph: 'Jedna.', confirmedOriginal: null, version: 1 },
    ]);
    expect((await many([one, two, three])).map((r) => r.futureItemId).sort()).toEqual(
      [one, two].sort(),
    );
  });

  it('removes the row at its version, and the akce goes back to the system paragraph', async () => {
    const id = await akce();
    await save(id, 'Moje.', 0);
    expect(await remove(id, 1)).toBe(true);
    expect(await many([id])).toEqual([]);
    // The next save starts over.
    expect(await save(id, 'Znovu.', 0)).toBe(1);
  });

  it('does not remove a row that moved on, or one that is not there', async () => {
    const id = await akce();
    await save(id, 'Moje.', 0);
    await save(id, 'Novější.', 1);
    expect(await remove(id, 1)).toBe(false);
    expect((await many([id]))[0]?.paragraph).toBe('Novější.');
    const other = await akce();
    expect(await remove(other, 1)).toBe(false);
  });

  it('keeps Czech text, line-free punctuation and the longest paragraph intact', async () => {
    const id = await akce();
    const longest = 'ž'.repeat(POINT_LIMITS.placeholder);
    await save(id, longest, 0);
    expect((await many([id]))[0]?.paragraph).toBe(longest);
    await save(id, 'Příloha „č. 1“ – 3 000 Kč.', 1);
    expect((await many([id]))[0]?.paragraph).toBe('Příloha „č. 1“ – 3 000 Kč.');
  });

  it('refuses an empty paragraph and one over the limit, as the table does', async () => {
    const id = await akce();
    const refused = new DatabaseFailure('db.constraint.report_placeholders_paragraph');
    await expect(save(id, '', 0)).rejects.toEqual(refused);
    await expect(save(id, 'x'.repeat(POINT_LIMITS.placeholder + 1), 0)).rejects.toEqual(refused);
    expect(await many([id])).toEqual([]);
  });

  it('confirms the system paragraph without a paragraph of its own, then keeps and clears it', async () => {
    const id = await akce();
    expect(await confirm(id, 'Systém.', 0)).toBe(1);
    expect(await many([id])).toEqual([
      { futureItemId: id, paragraph: null, confirmedOriginal: 'Systém.', version: 1 },
    ]);
    // A save puts the paragraph in and clears the confirmation; a confirmation keeps the paragraph.
    expect(await save(id, 'Moje.', 1)).toBe(2);
    expect((await many([id]))[0]).toMatchObject({ confirmedOriginal: null });
    expect(await confirm(id, 'Systém 2.', 2)).toBe(3);
    expect((await many([id]))[0]).toMatchObject({
      paragraph: 'Moje.',
      confirmedOriginal: 'Systém 2.',
    });
  });

  it('gives null to a stale confirmation and one winner to two first ones', async () => {
    const id = await akce();
    expect(await confirm(id, 'A.', 0)).toBe(1);
    expect(await confirm(id, 'B.', 0)).toBeNull();
    expect(await confirm(id, 'B.', 4)).toBeNull();
    expect((await many([id]))[0]?.confirmedOriginal).toBe('A.');
  });

  it('refuses an empty or over-long confirmation, as the table does', async () => {
    const id = await akce();
    const refused = new DatabaseFailure('db.constraint.report_placeholders_confirmed_original');
    await expect(confirm(id, '', 0)).rejects.toEqual(refused);
    await expect(confirm(id, 'x'.repeat(POINT_LIMITS.placeholder + 1), 0)).rejects.toEqual(refused);
    expect(await many([id])).toEqual([]);
  });

  it('refuses a row for an unknown akce', async () => {
    await expect(save('00000000-0000-7000-8000-999999999999', 'Nic.', 0)).rejects.toEqual(
      new DatabaseFailure('db.constraint.report_placeholders_future_item_id_future_items_id_fk'),
    );
  });

  it('is read by the system and by whoever previews an issue, and written by whoever edits one', async () => {
    const id = await akce();
    const head = await world.seed.user({ role: 'headmaster' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    expect(await save(id, 'Ředitel.', 0, world.as(head))).toBe(1);
    expect(await many([id], world.as(head))).toHaveLength(1);
    expect(await many([id], world.as(reviewer))).toHaveLength(1);
    expect(await many([id], system('job:test'))).toHaveLength(1);
    expect(await remove(id, 1, world.as(head))).toBe(true);
  });

  it('refuses the author and a reviewer to write and the author to read', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await fixtures.future({ author });
    await save(id, 'Ředitelův.', 0);
    for (const by of [author, reviewer]) {
      await expect(save(id, 'Cizí.', 1, world.as(by))).rejects.toBeInstanceOf(ScopeViolation);
      await expect(remove(id, 1, world.as(by))).rejects.toBeInstanceOf(ScopeViolation);
    }
    await expect(many([id], world.as(author))).rejects.toBeInstanceOf(ScopeViolation);
    expect((await many([id]))[0]?.paragraph).toBe('Ředitelův.');
  });

  it('writes nothing in a read transaction', async () => {
    const id = await akce();
    await expect(read((tx) => tx.reportPlaceholders.save(id, 'Text.', 0))).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
    await expect(read((tx) => tx.reportPlaceholders.remove(id, 1))).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
  });
});
