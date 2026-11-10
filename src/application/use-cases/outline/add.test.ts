import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { OUTLINE_LIMITS, SEED_OUTLINE } from '@/domain/outline';
import { calDate } from '@/domain/time';
import { dropIssue } from '../issues';

import {
  monday,
  outlineFixtures,
  richText,
  WEEK_1,
  WEEK_2,
  WEEK_3,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { addOutlineItem } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

const input = (over: Record<string, unknown> = {}) => ({
  monday: monday(WEEK_1),
  lineageId: randomUUID(),
  section: 'pokyny',
  title: 'Nový pokyn',
  persistence: 'standing',
  ...over,
});
const add = (by: Awaited<ReturnType<typeof fx.headmaster>>, over: Record<string, unknown> = {}) =>
  world.run(addOutlineItem, world.as(by), input(over));

const SEED_ROWS = SEED_OUTLINE.pokyny.length + SEED_OUTLINE.hospodareni.length;
const titles = (rows: readonly { title: string }[]) => rows.map((r) => r.title);

describe('outline.add', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await add(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(await fx.issueOf(WEEK_1)).toBeNull();
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('materialises the seed on the first write and adds the item at the end of the section', async () => {
    const head = await fx.headmaster();
    const before = await fx.readAs(head, WEEK_1);
    expect(before).toMatchObject({ ok: true, value: { version: null, origin: { kind: 'seed' } } });

    const lineageId = randomUUID();
    const result = await add(head, { lineageId, body: richText('Text pokynu.') });
    expect(result).toEqual({ ok: true, value: { version: 2, lineageId } });

    const after = await fx.readAs(head, WEEK_1);
    if (!after.ok) throw new Error('read refused');
    expect(after.value).toMatchObject({ version: 2, origin: { kind: 'stored', from: null } });
    expect(after.value.pokyny).toHaveLength(SEED_OUTLINE.pokyny.length + 1);
    expect(after.value.pokyny.at(-1)).toMatchObject({
      lineageId,
      title: 'Nový pokyn',
      slot: null,
      persistence: 'standing',
      proposal: null,
    });
    expect(titles(after.value.hospodareni)).toEqual(
      titles(before.ok ? before.value.hospodareni : []),
    );
  });

  it('puts an item of Hospodaření in its own section', async () => {
    const head = await fx.headmaster();
    const lineageId = randomUUID();
    await add(head, { lineageId, section: 'hospodareni', persistence: 'once' });
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.hospodareni.at(-1)).toMatchObject({ lineageId, persistence: 'once' });
    expect(read.value.pokyny.some((r) => r.lineageId === lineageId)).toBe(false);
  });

  it('records the materialisation from the seed and the add, ids and counts only', async () => {
    const head = await fx.headmaster();
    const lineageId = randomUUID();
    await add(head, { lineageId, title: 'Tajný název', body: richText('Tajný text') });
    const issue = await fx.issueOf(WEEK_1);
    const rows = await fx.auditOf('outline.materialized', 'outline.added');
    expect(rows.map((r) => [r.action, r.targetType, r.targetId, r.actorId])).toEqual([
      ['outline.materialized', 'issue', issue?.id, head.id],
      ['outline.added', 'issue', issue?.id, head.id],
    ]);
    expect(rows[0]?.data).toEqual({
      meta: {
        monday: monday(WEEK_1),
        origin: 'seed',
        rows: SEED_OUTLINE.pokyny.length + SEED_OUTLINE.hospodareni.length + 1,
      },
    });
    expect(rows[1]?.data).toEqual({
      meta: {
        monday: monday(WEEK_1),
        lineageId,
        section: 'pokyny',
        persistence: 'standing',
        rows: SEED_OUTLINE.pokyny.length + 1,
      },
    });
    expect(JSON.stringify(await world.inspect.audit())).not.toMatch(/Tajný/);
  });

  it('carries the earlier porada over into the next one on its first write', async () => {
    const head = await fx.headmaster();
    const first = await add(head, { title: 'Trvalý pokyn' });
    const second = await add(head, {
      title: 'Jednorázový',
      persistence: 'once',
      expectedVersion: first.ok ? first.value.version : 0,
    });
    expect(second.ok).toBe(true);

    expect((await add(head, { monday: monday(WEEK_2), title: 'Další' })).ok).toBe(true);
    const next = await fx.readAs(head, WEEK_2);
    if (!next.ok) throw new Error('read refused');
    expect(next.value.origin).toEqual({ kind: 'stored', from: null });
    expect(titles(next.value.pokyny)).toContain('Trvalý pokyn');
    expect(titles(next.value.pokyny)).not.toContain('Jednorázový');

    const rows = await fx.auditOf('outline.materialized');
    expect(rows.map((r) => r.data['meta'])).toEqual([
      { monday: monday(WEEK_1), origin: 'seed', rows: SEED_ROWS + 1 },
      {
        monday: monday(WEEK_2),
        origin: 'derived',
        from: monday(WEEK_1),
        how: 'carry',
        rows: SEED_ROWS + 2,
      },
    ]);
  });

  it('hands a dropped porada’s outline to the next one, one-offs included', async () => {
    const head = await fx.headmaster();
    await add(head, { title: 'Jednorázový', persistence: 'once' });
    const dropped = await world.run(dropIssue, world.as(head), {
      monday: monday(WEEK_1),
      confirmed: true,
      expectedVersion: 2,
    });
    expect(dropped.ok).toBe(true);
    const next = await fx.readAs(head, WEEK_2);
    if (!next.ok) throw new Error('read refused');
    expect(titles(next.value.pokyny)).toContain('Jednorázový');
    expect(await fx.readAs(head, WEEK_1)).toMatchObject({ ok: false });
  });

  it('leaves one item when the same lineageId is sent twice', async () => {
    const head = await fx.headmaster();
    const lineageId = randomUUID();
    const first = await add(head, { lineageId });
    const again = await add(head, {
      lineageId,
      title: 'Jiný název při opakování',
      expectedVersion: first.ok ? first.value.version : 0,
    });
    // The retry is a no-op: no version bump and no second audit row.
    expect(again).toEqual({ ok: true, value: { version: 2, lineageId } });
    expect((await fx.issueOf(WEEK_1))?.version).toBe(2);
    expect(await fx.auditOf('outline.added')).toHaveLength(1);
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    const same = read.value.pokyny.filter((r) => r.lineageId === lineageId);
    expect(same).toEqual([expect.objectContaining({ title: 'Nový pokyn' })]);
  });

  it('refuses a retry that names a stale version, even when the item is already there', async () => {
    const head = await fx.headmaster();
    const lineageId = randomUUID();
    await add(head, { lineageId });
    expect(await add(head, { lineageId, expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it.each(['start', 'approved'] as const)(
    'refuses a lineageId that is the id of a point (%s)',
    async (state) => {
      const head = await fx.headmaster();
      const lineageId =
        state === 'approved' ? await fx.approvedProposal() : await fx.start(head, 'pokyn');
      const before = await world.inspect.audit();
      expect(await add(head, { lineageId })).toEqual({
        ok: false,
        error: { code: 'invalid-input', fields: { lineageId: 'invalid' } },
      });
      expect(await fx.issueOf(WEEK_1)).toBeNull();
      expect(await world.inspect.audit()).toEqual(before);
    },
  );

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    await add(head);
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit()];
    expect(await add(head, { expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await add(head, { expectedVersion: 7 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit()]).toEqual(before);
  });

  it('refuses a version for a Monday that has no row yet', async () => {
    const head = await fx.headmaster();
    expect(await add(head, { expectedVersion: 4 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a full section as outline-full', async () => {
    const head = await fx.headmaster();
    let version: number | undefined;
    for (let rows = SEED_OUTLINE.pokyny.length; rows < OUTLINE_LIMITS.rowsPerSection; rows++) {
      const done = await add(head, { expectedVersion: version });
      if (!done.ok) throw new Error(`add ${rows} refused`);
      version = done.value.version;
    }
    const before = await world.inspect.audit();
    expect(await add(head, { expectedVersion: version })).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'outline-full' },
    });
    expect(await world.inspect.audit()).toEqual(before);
    // The other section has room.
    expect((await add(head, { section: 'hospodareni', expectedVersion: version })).ok).toBe(true);
  });

  it('refuses a dropped porada, a generated one, a past one and one outside the calendar', async () => {
    const head = await fx.headmaster();
    const dropped = await world.run(dropIssue, world.as(head), {
      monday: monday(WEEK_2),
      confirmed: true,
    });
    expect(dropped.ok).toBe(true);
    expect(await add(head, { monday: monday(WEEK_2) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    const notOpen = { ok: false, error: { code: 'rule', rule: 'issue-not-open' } };
    await fx.seedIssue(WEEK_3, 'generated');
    expect(await add(head, { monday: monday(WEEK_3) })).toEqual(notOpen);
    // Before this week and past the horizon the Monday is not in the calendar.
    expect(await add(head, { monday: monday(calDate(2026, 10, 12)) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await add(head, { monday: monday(calDate(2030, 1, 7)) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await fx.auditOf('outline.added')).toEqual([]);
  });

  it('does not store a proposal nobody placed', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal();
    await add(head);
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.pokyny.at(-1)).toMatchObject({
      lineageId: pointId,
      proposal: { pointId, isNew: true },
    });
    const issue = await fx.issueOf(WEEK_1);
    const stored = await world.tx(
      world.as(head),
      (tx) => tx.issueItems.forIssue(issue!.id),
      'read',
    );
    expect(stored.pokyny.some((r) => r.sourcePointId !== null)).toBe(false);
  });

  it.each([
    ['an empty title', { title: '  ' }],
    ['a title over 300 characters', { title: 'x'.repeat(OUTLINE_LIMITS.title + 1) }],
    ['a title with a line break', { title: 'a\nb' }],
    ['an unknown section', { section: 'jine' }],
    ['a lineage id that is no uuid', { lineageId: 'abc' }],
    ['a Monday that is no date', { monday: '2026-02-30' }],
    ['a day that is no Monday', { monday: '2026-11-03' }],
    ['a field the form does not have', { extra: 1 }],
  ])('refuses %s as invalid input', async (_name, over) => {
    const head = await fx.headmaster();
    expect(await add(head, over)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await world.inspect.audit()).toEqual([]);
  });
});
