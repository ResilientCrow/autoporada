import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { parseIsoDate as d } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { confirmPlaceholder, dropIssue, issueMissingReports, setPlaceholder } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

// The clock starts Monday 19 October 2026: the porada of 26 October owes the akce that ended from
// 19 to 25 October.
const MONDAY = '2026-10-26';

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });

const listed = async (by: UserRecord) => {
  const result = await world.run(issueMissingReports, world.as(by), { monday: MONDAY });
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value.reports;
};

/** Sends what the page read (the listed row’s versions) unless `over` names others. */
const confirm = async (by: UserRecord, itemId: string, over: Record<string, unknown> = {}) => {
  const row = (await listed(by)).find((r) => r.id === itemId);
  return world.run(confirmPlaceholder, world.as(by), {
    monday: MONDAY,
    itemId,
    expectedVersion: row?.version ?? 0,
    akceVersion: row?.akceVersion ?? 1,
    ...over,
  });
};

const storedOf = (itemId: string) =>
  world.tx(cli, (tx) => tx.reportPlaceholders.many([itemId]), 'read');

async function owed(author?: UserRecord) {
  const by = author ?? (await submitter());
  const id = await fixtures.future({ author: by, title: 'Seminář', startDate: d('2026-10-22') });
  return { id, author: by };
}

/** The author changes the title: the akce moves to its next version and the system text changes. */
async function retitle(author: UserRecord, id: string, title: string) {
  await world.tx(world.as(author), async (tx) => {
    const akce = (await tx.futureItems.loadForWrite(id))!;
    await tx.futureItems.update(id, akce.version, { content: { ...akce.content, title } });
    await tx.audit.record({ action: 'test.seed', target: { type: 'future_item', id } });
  });
}

describe('issues.confirmPlaceholder', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const { id } = await owed();
      const user = await world.seed.user({ role });
      const sent = await world.run(confirmPlaceholder, world.as(user), {
        monday: MONDAY,
        itemId: id,
        expectedVersion: 0,
        akceVersion: 1,
      });
      expect(sent).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(await storedOf(id)).toEqual([]);
    },
  );

  it('stores the system paragraph as confirmed, audits it without text and marks the row checked', async () => {
    const head = await headmaster();
    const { id } = await owed();
    const [before] = await listed(head);
    expect(before).toMatchObject({ id, checked: false, status: 'open', own: false });

    expect(await confirm(head, id)).toEqual({ ok: true, value: { version: 1 } });

    expect(await storedOf(id)).toEqual([
      { futureItemId: id, paragraph: null, confirmedOriginal: before!.original, version: 1 },
    ]);
    const [after] = await listed(head);
    expect(after).toMatchObject({ checked: true, status: 'checked', own: false });
    expect(after!.paragraph).toBe(before!.paragraph);
    const rows = (await world.inspect.audit()).filter(
      (row) => row.action === 'issue.placeholder_confirmed',
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain('Seminář');
  });

  it('is checked only while the confirmed text is the one the system writes now', async () => {
    const head = await headmaster();
    const { id, author } = await owed();
    await confirm(head, id);
    await retitle(author, id, 'Jiný seminář');
    expect(await listed(head)).toEqual([
      expect.objectContaining({ checked: false, status: 'open' }),
    ]);
    expect(await confirm(head, id)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(await listed(head)).toEqual([expect.objectContaining({ checked: true })]);
  });

  it('refuses a confirmation of an akce that moved on since the headmaster read it', async () => {
    const head = await headmaster();
    const { id, author } = await owed();
    const [read] = await listed(head);
    await retitle(author, id, 'Jiný seminář');
    expect(await confirm(head, id, { akceVersion: read!.akceVersion })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await storedOf(id)).toEqual([]);
  });

  it('refuses a stale placeholder version', async () => {
    const head = await headmaster();
    const { id } = await owed();
    await confirm(head, id);
    expect(await confirm(head, id, { expectedVersion: 0 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await confirm(head, id, { expectedVersion: 7 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it('answers not-found for an akce the porada does not owe', async () => {
    const head = await headmaster();
    const author = await submitter();
    const later = await fixtures.future({ author, startDate: d('2026-11-20') });
    expect(await confirm(head, later)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(await confirm(head, '00000000-0000-7000-8000-999999999999')).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await storedOf(later)).toEqual([]);
  });

  it('keeps the headmaster’s own paragraph, and a later save un-checks it', async () => {
    const head = await headmaster();
    const { id } = await owed();
    await world.run(setPlaceholder, world.as(head), {
      monday: MONDAY,
      itemId: id,
      paragraph: 'Vlastní věta.',
      expectedVersion: 0,
    });
    expect(await confirm(head, id)).toEqual({ ok: true, value: { version: 2 } });
    expect((await storedOf(id))[0]).toMatchObject({
      paragraph: 'Vlastní věta.',
      confirmedOriginal: expect.any(String),
    });
    expect(await listed(head)).toEqual([
      expect.objectContaining({ own: true, checked: true, paragraph: 'Vlastní věta.' }),
    ]);

    await world.run(setPlaceholder, world.as(head), {
      monday: MONDAY,
      itemId: id,
      paragraph: 'Jiná věta.',
      expectedVersion: 2,
    });
    expect((await storedOf(id))[0]).toMatchObject({ confirmedOriginal: null, version: 3 });
    expect(await listed(head)).toEqual([expect.objectContaining({ checked: false })]);
  });

  it('answers invalid-input for a Monday that is no porada', async () => {
    const head = await headmaster();
    const { id } = await owed();
    await world.run(dropIssue, world.as(head), { monday: '2026-10-19', confirmed: true });
    expect(await confirm(head, id, { monday: '2026-10-19' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { monday: 'invalid' } },
    });
  });
});
