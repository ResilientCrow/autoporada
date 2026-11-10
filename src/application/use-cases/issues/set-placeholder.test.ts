import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { POINT_LIMITS } from '@/domain/report';
import { calDate, parseIsoDate as d } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { dropIssue, setPlaceholder } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

// The clock starts Monday 19 October 2026. With no stored rows the porada of 26 October owes the
// akce that ended from 19 to 25 October (`reportsSince`).
const W1 = calDate(2026, 10, 26);
const MONDAY = '2026-10-26';

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });

const send = (by: UserRecord, itemId: string, over: Record<string, unknown> = {}) =>
  world.run(setPlaceholder, world.as(by), {
    monday: MONDAY,
    itemId,
    paragraph: 'Vlastní věta.',
    expectedVersion: 0,
    ...over,
  });

/** The audit rows of this use case; the fixtures leave their own. */
const placeholderAudit = async () =>
  (await world.inspect.audit()).filter((row) => row.action.startsWith('issue.placeholder_'));

const storedOf = (itemId: string) =>
  world.tx(cli, (tx) => tx.reportPlaceholders.many([itemId]), 'read');

/** An approved akce that ended on 22 October: owed to the porada of 26 October. */
async function owedAkce() {
  const author = await submitter();
  return fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
}

describe('issues.setPlaceholder', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const id = await owedAkce();
      const user = await world.seed.user({ role });
      expect(await send(user, id)).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(await storedOf(id)).toEqual([]);
      expect(await placeholderAudit()).toEqual([]);
    },
  );

  it('stores the first paragraph of an akce at version 1', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    expect(await send(head, id)).toEqual({ ok: true, value: { version: 1 } });
    expect(await storedOf(id)).toEqual([
      { futureItemId: id, paragraph: 'Vlastní věta.', version: 1 },
    ]);
  });

  it('updates it with the version the page read', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id);
    expect(await send(head, id, { paragraph: 'Jiná věta.', expectedVersion: 1 })).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect((await storedOf(id))[0]).toMatchObject({ paragraph: 'Jiná věta.', version: 2 });
  });

  it('trims the paragraph and collapses line breaks into one line', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id, { paragraph: '  První věta.\r\n\n  Druhá věta.\t ' });
    expect((await storedOf(id))[0]?.paragraph).toBe('První věta. Druhá věta.');
  });

  it('refuses a stale version as a conflict and changes nothing', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id);
    const before = [await storedOf(id), await placeholderAudit()];
    expect(await send(head, id, { paragraph: 'Pozdě.', expectedVersion: 5 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    // A page that saw no row loses to the row another save made.
    expect(await send(head, id, { paragraph: 'Pozdě.', expectedVersion: 0 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await storedOf(id), await placeholderAudit()]).toEqual(before);
  });

  it('removes the row on null, back to the system’s paragraph, and answers version 0', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id);
    expect(await send(head, id, { paragraph: null, expectedVersion: 1 })).toEqual({
      ok: true,
      value: { version: 0 },
    });
    expect(await storedOf(id)).toEqual([]);
    // A new text starts again from no row.
    expect(await send(head, id)).toEqual({ ok: true, value: { version: 1 } });
  });

  it('refuses a stale reset as a conflict and keeps the row', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id);
    await send(head, id, { paragraph: 'Nová.', expectedVersion: 1 });
    expect(await send(head, id, { paragraph: null, expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await storedOf(id)).toHaveLength(1);
  });

  it('audits a save and a reset on the akce, with ids and no text', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id, { paragraph: 'Tajná věta.' });
    await send(head, id, { paragraph: null, expectedVersion: 1 });
    const [saved, reset] = await placeholderAudit();
    expect(saved).toMatchObject({
      action: 'issue.placeholder_saved',
      actorId: head.id,
      targetType: 'future_item',
      targetId: id,
      data: { meta: { monday: MONDAY } },
    });
    expect(reset).toMatchObject({
      action: 'issue.placeholder_reset',
      targetType: 'future_item',
      targetId: id,
      data: { meta: { monday: MONDAY } },
    });
    expect(JSON.stringify(await placeholderAudit())).not.toMatch(/Tajná/);
  });

  it('refuses an akce that is not owed to the porada, naming the field', async () => {
    const head = await headmaster();
    const author = await submitter();
    const before = await fixtures.future({ author, startDate: d('2026-10-15') });
    const after = await fixtures.future({ author, startDate: d('2026-10-28') });
    const draft = await fixtures.future({ author, startDate: d('2026-10-22'), state: 'draft' });
    for (const id of [before, after, draft, randomUUID()]) {
      expect(await send(head, id)).toEqual({
        ok: false,
        error: { code: 'invalid-input', fields: { itemId: 'invalid' } },
      });
    }
    expect(await placeholderAudit()).toEqual([]);
  });

  it('refuses an id that is no uuid before reading anything', async () => {
    const head = await headmaster();
    expect(await send(head, 'nope')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input', fields: { itemId: 'invalid' } },
    });
  });

  it('refuses a generated porada as issue-not-open', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await fixtures.issue(W1, { status: 'generated' });
    expect(await send(head, id)).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'issue-not-open' },
    });
    expect(await storedOf(id)).toEqual([]);
    expect(await placeholderAudit()).toEqual([]);
  });

  it.each(['2026-10-27', 'not-a-date', '2020-01-06'])(
    'refuses %s as a Monday of no slot',
    async (monday) => {
      const head = await headmaster();
      const id = await owedAkce();
      expect(await send(head, id, { monday })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input', fields: { monday: expect.any(String) } },
      });
    },
  );

  it.each([
    ['empty', '', 'required'],
    ['blank', ' \n\t ', 'required'],
    ['too long', 'x'.repeat(POINT_LIMITS.opening + 1), 'too-long'],
  ])('refuses a %s paragraph', async (_name, paragraph, code) => {
    const head = await headmaster();
    const id = await owedAkce();
    expect(await send(head, id, { paragraph })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { paragraph: code } },
    });
    expect(await storedOf(id)).toEqual([]);
    expect(await placeholderAudit()).toEqual([]);
  });

  it('drops control characters like every text input, before the length is counted', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    await send(head, id, { paragraph: 'Vě\u0000ta.' });
    expect((await storedOf(id))[0]?.paragraph).toBe('Věta.');
  });

  it('takes a paragraph of POINT_LIMITS.opening characters', async () => {
    const head = await headmaster();
    const id = await owedAkce();
    const paragraph = 'ž'.repeat(POINT_LIMITS.opening);
    expect(await send(head, id, { paragraph })).toEqual({ ok: true, value: { version: 1 } });
  });

  it('accepts the akce of an earlier porada once a dropped one moves its window', async () => {
    // 19 October dropped: its akce are owed to 26 October, which then reaches back to 12 October.
    const head = await headmaster();
    const author = await submitter();
    await world.run(dropIssue, world.as(head), { monday: '2026-10-19', confirmed: true });
    const id = await fixtures.future({ author, startDate: d('2026-10-15') });
    expect(await send(head, id)).toEqual({ ok: true, value: { version: 1 } });
  });
});
