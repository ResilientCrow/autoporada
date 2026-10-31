import { describe, expect, it } from 'vitest';

import { ANNEX1_MAX_BYTES, emptyRichDoc } from '@/domain/richtext';

import { doc, paragraph } from '../../../../test/support/points';
import {
  monday,
  outlineFixtures,
  richText,
  WEEK_1,
  WEEK_2,
  WEEK_3,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { readIssueTexts, setIssueAnnex2, setSkipped } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const annex = (by: User, body: unknown, over: Record<string, unknown> = {}, day = WEEK_1) =>
  world.run(setIssueAnnex2, world.as(by), { monday: monday(day), body, ...over });
const annexOf = async (by: User, day = WEEK_1) => {
  const result = await world.run(readIssueTexts, world.as(by), { monday: monday(day) });
  if (!result.ok) throw new Error('texts refused');
  return result.value;
};

/** A one-paragraph document whose JSON is exactly `bytes` long. */
function docOfBytes(bytes: number) {
  const size = (n: number) => JSON.stringify(doc(paragraph('x'.repeat(n)))).length;
  return doc(paragraph('x'.repeat(bytes - size(0))));
}

describe('issues.setAnnex2', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await annex(user, richText('A'))).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(await fx.issueOf(WEEK_1)).toBeNull();
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('stores the annex of the porada, and later poradas carry it', async () => {
    const head = await fx.headmaster();
    expect(await annex(head, richText('Příloha 2'))).toEqual({ ok: true, value: { version: 2 } });
    expect(await annexOf(head)).toMatchObject({
      annex2: richText('Příloha 2'),
      carried: { annex2: false },
    });
    expect(await annexOf(head, WEEK_2)).toMatchObject({
      annex2: richText('Příloha 2'),
      carried: { annex2: true },
    });
  });

  it('stores „Odebrat přílohu“ as an empty document that later poradas carry as no annex', async () => {
    const head = await fx.headmaster();
    await annex(head, richText('Příloha 2'));
    expect(await annex(head, emptyRichDoc(), {}, WEEK_2)).toMatchObject({ ok: true });
    expect(await annexOf(head, WEEK_2)).toMatchObject({
      annex2: emptyRichDoc(),
      carried: { annex2: false },
    });
    // Not the annex of WEEK_1 behind it.
    expect(await annexOf(head, WEEK_3)).toMatchObject({
      annex2: emptyRichDoc(),
      carried: { annex2: true },
    });
    const [, removed] = await fx.auditOf('issue.annex2_saved');
    expect(removed?.data).toEqual({ meta: { monday: monday(WEEK_2), removed: true } });
  });

  it('audits a cleared editor (one empty paragraph) as removed, as the texts read it', async () => {
    const head = await fx.headmaster();
    expect(
      await annex(head, {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [] }],
      }),
    ).toMatchObject({ ok: true });
    const [saved] = await fx.auditOf('issue.annex2_saved');
    expect(saved?.data).toEqual({ meta: { monday: monday(WEEK_1), removed: true } });
  });

  it('records the event without the text', async () => {
    const head = await fx.headmaster();
    await annex(head, richText('Tajná příloha'));
    const issue = await fx.issueOf(WEEK_1);
    const [saved] = await fx.auditOf('issue.annex2_saved');
    expect(saved).toMatchObject({
      actorId: head.id,
      targetType: 'issue',
      targetId: issue?.id,
      data: { meta: { monday: monday(WEEK_1), removed: false } },
    });
    expect(JSON.stringify(await world.inspect.audit())).not.toMatch(/Tajná/);
  });

  it('leaves Přítomni and Hosté as they are', async () => {
    const head = await fx.headmaster();
    await annex(head, richText('Příloha'));
    expect(await annexOf(head)).toMatchObject({
      present: '',
      guests: '',
      carried: { present: true, guests: true },
    });
  });

  it('takes a document of ANNEX1_MAX_BYTES and refuses one byte more', async () => {
    const head = await fx.headmaster();
    expect(JSON.stringify(docOfBytes(ANNEX1_MAX_BYTES)).length).toBe(ANNEX1_MAX_BYTES);
    expect(await annex(head, docOfBytes(ANNEX1_MAX_BYTES + 1))).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await world.inspect.audit()).toEqual([]);
    expect(await annex(head, docOfBytes(ANNEX1_MAX_BYTES))).toMatchObject({ ok: true });
  });

  it.each([
    ['not a document', { type: 'text' }],
    ['a node the profile does not know', { type: 'doc', content: [{ type: 'heading' }] }],
    ['no body', undefined],
  ])('refuses %s as invalid input', async (_name, body) => {
    const head = await fx.headmaster();
    expect(await annex(head, body)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    await annex(head, richText('A'));
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit()];
    expect(await annex(head, richText('B'), { expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit()]).toEqual(before);
    expect(await annex(head, richText('B'), { expectedVersion: 2 })).toEqual({
      ok: true,
      value: { version: 3 },
    });
  });

  it('refuses a skipped porada as issue-not-open', async () => {
    const head = await fx.headmaster();
    await world.run(setSkipped, world.as(head), {
      monday: monday(WEEK_2),
      event: 'skip',
      confirmed: true,
    });
    expect(await annex(head, richText('A'), {}, WEEK_2)).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'issue-not-open' },
    });
  });
});
