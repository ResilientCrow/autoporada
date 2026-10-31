import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { OUTLINE_LIMITS, SEED_OUTLINE } from '@/domain/outline';

import {
  monday,
  outlineFixtures,
  richText,
  slotRow,
  WEEK_1,
  WEEK_2,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { setSkipped } from '../issues';
import { readOutlineItem, saveOutlineItem } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const save = (by: User, lineageId: string, over: Record<string, unknown> = {}) =>
  world.run(saveOutlineItem, world.as(by), { monday: monday(WEEK_1), lineageId, ...over });

const statement = (n: number) => ({ speakerGenitive: `pana Nováka ${n}`, quote: `Citát ${n}` });
const rule = (code: string) => ({ ok: false, error: { code: 'rule', rule: code } });

describe('outline.save', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await save(user, slotRow('talent').lineageId, { title: 'X' })).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('changes the title, text and persistence of an added item and keeps its place', async () => {
    const head = await fx.headmaster();
    const first = await fx.addItem(head, WEEK_1, 'První');
    const second = await fx.addItem(head, WEEK_1, 'Druhý', { expectedVersion: 2 });
    const result = await save(head, first, {
      expectedVersion: 3,
      title: 'Přejmenovaný',
      body: richText('Nový text.'),
      persistence: 'once',
    });
    expect(result).toEqual({ ok: true, value: { version: 4, lineageId: first } });

    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.pokyny.slice(-2)).toMatchObject([
      { lineageId: first, title: 'Přejmenovaný', persistence: 'once' },
      { lineageId: second, title: 'Druhý' },
    ]);
    const item = await world.run(readOutlineItem, world.as(head), {
      monday: monday(WEEK_1),
      lineageId: first,
    });
    expect(item).toMatchObject({ ok: true, value: { body: richText('Nový text.') } });
  });

  it('materialises the seed when a slot is the first thing saved, and keeps the slot a standing item', async () => {
    const head = await fx.headmaster();
    const talent = slotRow('talent');
    const result = await save(head, talent.lineageId, { title: 'Studenti v programu' });
    expect(result).toEqual({ ok: true, value: { version: 2, lineageId: talent.lineageId } });
    const rows = await fx.auditOf('outline.materialized', 'outline.saved');
    expect(rows.map((r) => r.action)).toEqual(['outline.materialized', 'outline.saved']);
    const read = await fx.readAs(head, WEEK_1);
    if (!read.ok) throw new Error('read refused');
    expect(read.value.origin.kind).toBe('stored');
    expect(read.value.pokyny).toHaveLength(SEED_OUTLINE.pokyny.length);
    expect(read.value.pokyny.find((r) => r.lineageId === talent.lineageId)).toMatchObject({
      slot: 'talent',
      title: 'Studenti v programu',
      persistence: 'standing',
    });
  });

  it('records the saved fields and the number of quotes, never the text', async () => {
    const head = await fx.headmaster();
    const partners = slotRow('partners');
    const media = slotRow('media');
    await save(head, partners.lineageId, {
      title: 'Tajný název',
      quotes: [statement(1), statement(2)],
    });
    await save(head, media.lineageId, { body: richText('Tajný text'), expectedVersion: 2 });
    const [saved, savedMedia] = await fx.auditOf('outline.saved');
    expect(saved?.data).toEqual({
      meta: {
        monday: monday(WEEK_1),
        lineageId: partners.lineageId,
        fields: ['title', 'quotes'],
        quotes: 2,
      },
    });
    expect(savedMedia?.data).toEqual({
      meta: { monday: monday(WEEK_1), lineageId: media.lineageId, fields: ['body'] },
    });
    expect(JSON.stringify(await world.inspect.audit())).not.toMatch(/Tajný|Citát|Nováka/);
  });

  it('stores the quotes of the partners slot, and an empty list clears them', async () => {
    const head = await fx.headmaster();
    const partners = slotRow('partners');
    const done = await save(head, partners.lineageId, { quotes: [statement(1), statement(2)] });
    const read = await world.run(readOutlineItem, world.as(head), {
      monday: monday(WEEK_1),
      lineageId: partners.lineageId,
    });
    expect(read).toMatchObject({ ok: true, value: { quotes: [statement(1), statement(2)] } });
    const cleared = await save(head, partners.lineageId, {
      quotes: [],
      expectedVersion: done.ok ? done.value.version : 0,
    });
    expect(cleared.ok).toBe(true);
    expect(await fx.readAs(head, WEEK_1)).toMatchObject({
      value: { pokyny: expect.arrayContaining([expect.objectContaining({ quotes: 0 })]) },
    });
  });

  it.each(['meetings', 'events', 'partners'] as const)(
    'refuses a body on the %s slot as slot-fixed, and changes nothing',
    async (slot) => {
      const head = await fx.headmaster();
      expect(await save(head, slotRow(slot).lineageId, { body: richText('Text') })).toEqual(
        rule('slot-fixed'),
      );
      expect(await fx.issueOf(WEEK_1)).toBeNull();
    },
  );

  it('refuses making a slot a one-off as slot-fixed, and changes nothing', async () => {
    const head = await fx.headmaster();
    const events = slotRow('events');
    expect(await save(head, events.lineageId, { persistence: 'once' })).toEqual(rule('slot-fixed'));
    expect(await fx.issueOf(WEEK_1)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses quotes on any item but the partners slot as quotes-not-allowed', async () => {
    const head = await fx.headmaster();
    const added = await fx.addItem(head, WEEK_1, 'Pokyn');
    expect(await save(head, added, { quotes: [statement(1)], expectedVersion: 2 })).toEqual(
      rule('quotes-not-allowed'),
    );
    expect(
      await save(head, slotRow('media').lineageId, { quotes: [statement(1)], expectedVersion: 2 }),
    ).toEqual(rule('quotes-not-allowed'));
  });

  // The contract caps the list at OUTLINE_LIMITS.quotes before the op sees it, so `quotes-full` is
  // a second line of defence that the use case cannot reach.
  it('takes 20 quotes and refuses 21 at the boundary', async () => {
    const head = await fx.headmaster();
    const partners = slotRow('partners');
    const many = (n: number) => Array.from({ length: n }, (_, i) => statement(i));
    const over = await save(head, partners.lineageId, { quotes: many(OUTLINE_LIMITS.quotes + 1) });
    expect(over).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await world.inspect.audit()).toEqual([]);
    expect((await save(head, partners.lineageId, { quotes: many(OUTLINE_LIMITS.quotes) })).ok).toBe(
      true,
    );
  });

  it('refuses a proposal’s row as proposal-fixed: its text is the point’s', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal();
    const before = await world.inspect.audit();
    expect(await save(head, pointId, { title: 'Jiný název' })).toEqual(rule('proposal-fixed'));
    expect(await world.inspect.audit()).toEqual(before);
  });

  it('refuses an unknown item as item-missing', async () => {
    const head = await fx.headmaster();
    expect(await save(head, randomUUID(), { title: 'X' })).toEqual(rule('item-missing'));
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_1, 'Pokyn');
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit()];
    expect(await save(head, id, { title: 'Nový', expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit()]).toEqual(before);
  });

  it('refuses a skipped porada as issue-not-open', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_2, 'Pokyn');
    await world.run(setSkipped, world.as(head), {
      monday: monday(WEEK_2),
      event: 'skip',
      confirmed: true,
      expectedVersion: 2,
    });
    expect(
      await save(head, id, { monday: monday(WEEK_2), title: 'X', expectedVersion: 3 }),
    ).toEqual(rule('issue-not-open'));
  });

  it.each([
    ['an empty title', { title: ' ' }],
    ['an over-long title', { title: 'x'.repeat(OUTLINE_LIMITS.title + 1) }],
    ['an unknown persistence', { persistence: 'forever' }],
    ['a quote over its bound', { quotes: [{ speakerGenitive: 'x'.repeat(500), quote: 'q' }] }],
  ])('refuses %s as invalid input', async (_name, over) => {
    const head = await fx.headmaster();
    expect(await save(head, slotRow('partners').lineageId, over)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await world.inspect.audit()).toEqual([]);
  });
});
