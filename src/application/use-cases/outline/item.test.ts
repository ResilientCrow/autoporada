import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SEED_OUTLINE } from '@/domain/outline';

import {
  monday,
  outlineFixtures,
  richText,
  slotRow,
  WEEK_1,
  WEEK_2,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { readOutlineItem, saveOutlineItem } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const item = (by: User, lineageId: string, day = WEEK_1) =>
  world.run(readOutlineItem, world.as(by), { monday: monday(day), lineageId });

describe('outline.item', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    expect(await item(user, slotRow('talent').lineageId)).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('answers a seed slot with its text, no quotes and no proposal, and writes nothing', async () => {
    const head = await fx.headmaster();
    const talent = slotRow('talent');
    const result = await item(head, talent.lineageId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        monday: monday(WEEK_1),
        version: null,
        lineageId: talent.lineageId,
        section: 'pokyny',
        slot: 'talent',
        persistence: 'standing',
        title: talent.title,
        quotes: [],
        proposal: null,
      },
    });
    expect(result.ok && result.value.body.content.length).toBe(talent.body!.content.length);
    expect(await fx.issueOf(WEEK_1)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('answers the item as stored after a save: text, quotes, persistence, version', async () => {
    const head = await fx.headmaster();
    const partners = slotRow('partners');
    const quote = { speakerGenitive: 'pana Nováka', affiliation: 'Firma', quote: 'Citát' };
    await world.run(saveOutlineItem, world.as(head), {
      monday: monday(WEEK_1),
      lineageId: partners.lineageId,
      body: richText('Text ohlasu.'),
      quotes: [quote],
    });
    const id = await fx.addItem(head, WEEK_1, 'Jednorázový', {
      persistence: 'once',
      expectedVersion: 2,
    });
    expect(await item(head, partners.lineageId)).toMatchObject({
      ok: true,
      value: { version: 3, body: richText('Text ohlasu.'), quotes: [quote] },
    });
    expect(await item(head, id)).toMatchObject({
      ok: true,
      value: { persistence: 'once', title: 'Jednorázový', slot: null },
    });
  });

  it('answers the item of a derived outline before the first write', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_1, 'Trvalý pokyn');
    expect(await item(head, id, WEEK_2)).toMatchObject({
      ok: true,
      value: { version: null, lineageId: id, title: 'Trvalý pokyn' },
    });
  });

  it('answers a proposal row with the point’s own title, and no quotes', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal('finance');
    expect(await item(head, pointId)).toMatchObject({
      ok: true,
      value: {
        section: 'hospodareni',
        slot: null,
        title: 'Den',
        proposal: { pointId },
        quotes: [],
      },
    });
  });

  it('does not find an unknown item or a Monday outside the calendar', async () => {
    const head = await fx.headmaster();
    expect(await item(head, randomUUID())).toEqual({ ok: false, error: { code: 'not-found' } });
    expect(
      await world.run(readOutlineItem, world.as(head), {
        monday: '2030-01-07',
        lineageId: SEED_OUTLINE.pokyny[0]!.lineageId,
      }),
    ).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  it('refuses a day that is no Monday or no lineage id', async () => {
    const head = await fx.headmaster();
    expect(
      await world.run(readOutlineItem, world.as(head), {
        monday: '2026-11-03',
        lineageId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await world.run(readOutlineItem, world.as(head), { monday: monday(WEEK_1), lineageId: 'x' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
});
