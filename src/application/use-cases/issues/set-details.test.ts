import { describe, expect, it } from 'vitest';

import { ISSUE_TEXT_MAX } from '@/contracts';

import {
  monday,
  outlineFixtures,
  richText,
  WEEK_1,
  WEEK_2,
  WEEK_3,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { readIssueTexts, setIssueAnnex2, setIssueDetails, setSkipped } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const details = (by: User, over: Record<string, unknown> = {}, day = WEEK_1) =>
  world.run(setIssueDetails, world.as(by), {
    monday: monday(day),
    present: 'Jana Nováková',
    guests: 'Petr Svoboda',
    ...over,
  });
const texts = async (by: User, day = WEEK_1) => {
  const result = await world.run(readIssueTexts, world.as(by), { monday: monday(day) });
  if (!result.ok) throw new Error(`texts refused: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('issues.setDetails', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await details(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(await fx.issueOf(WEEK_1)).toBeNull();
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('makes the issue on the first save and stores both texts, trimmed', async () => {
    const head = await fx.headmaster();
    expect(await texts(head)).toMatchObject({ version: null, present: '', guests: '' });
    const result = await details(head, { present: '  Jana Nováková  ', guests: 'Petr\nEva' });
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(await texts(head)).toMatchObject({
      version: 2,
      present: 'Jana Nováková',
      guests: 'Petr\nEva',
      carried: { present: false, guests: false, annex2: true },
    });
  });

  it('records the event with the fields it set, never the names', async () => {
    const head = await fx.headmaster();
    await details(head, { present: 'Tajné Jméno' });
    const issue = await fx.issueOf(WEEK_1);
    const rows = await fx.auditOf('issue.details_saved');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: head.id,
      targetType: 'issue',
      targetId: issue?.id,
      data: { meta: { monday: monday(WEEK_1), fields: ['present', 'guests'] } },
    });
    expect(JSON.stringify(await world.inspect.audit())).not.toMatch(/Tajné|Svoboda/);
  });

  it('carries the texts to the next porada until it saves its own', async () => {
    const head = await fx.headmaster();
    await details(head);
    expect(await texts(head, WEEK_2)).toMatchObject({
      version: null,
      present: 'Jana Nováková',
      guests: 'Petr Svoboda',
      carried: { present: true, guests: true, annex2: true },
    });
    await details(head, { present: 'Nový člen', guests: 'Jiný host' }, WEEK_2);
    expect(await texts(head, WEEK_2)).toMatchObject({
      present: 'Nový člen',
      carried: { present: false, guests: false },
    });
    // The earlier porada keeps its own.
    expect(await texts(head, WEEK_1)).toMatchObject({ present: 'Jana Nováková' });
  });

  it('stores a cleared text as cleared, and later poradas carry it as cleared', async () => {
    const head = await fx.headmaster();
    await details(head);
    await details(head, { present: '', guests: '' }, WEEK_2);
    expect(await texts(head, WEEK_2)).toMatchObject({
      present: '',
      guests: '',
      carried: { present: false, guests: false },
    });
    expect(await texts(head, WEEK_3)).toMatchObject({
      present: '',
      guests: '',
      carried: { present: true, guests: true },
    });
  });

  it('leaves the annex alone', async () => {
    const head = await fx.headmaster();
    const annex = await world.run(setIssueAnnex2, world.as(head), {
      monday: monday(WEEK_1),
      body: richText('Příloha'),
    });
    expect(annex).toEqual({ ok: true, value: { version: 2 } });
    await details(head, { expectedVersion: 2 });
    expect(await texts(head)).toMatchObject({
      annex2: richText('Příloha'),
      carried: { annex2: false },
    });
  });

  it('stores the text without control and direction characters, which the pipeline strips', async () => {
    const head = await fx.headmaster();
    await details(head, { present: 'a\u0007b', guests: 'c\u202ed' });
    expect(await texts(head)).toMatchObject({ present: 'ab', guests: 'cd' });
  });

  it('takes 2000 characters and refuses 2001', async () => {
    const head = await fx.headmaster();
    const long = (n: number) => 'x'.repeat(n);
    expect(await details(head, { present: long(ISSUE_TEXT_MAX + 1) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await details(head, { guests: long(ISSUE_TEXT_MAX + 1) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await world.inspect.audit()).toEqual([]);
    expect(
      await details(head, { present: long(ISSUE_TEXT_MAX), guests: long(ISSUE_TEXT_MAX) }),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ['a text that is missing', { present: undefined }],
    ['a field the form does not have', { extra: 'x' }],
  ])('refuses %s as invalid input', async (_name, over) => {
    const head = await fx.headmaster();
    expect(await details(head, over)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    await details(head);
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit()];
    expect(await details(head, { present: 'Jiný', expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await details(head, { present: 'Jiný', expectedVersion: 9 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit()]).toEqual(before);
    expect(await details(head, { present: 'Jiný', expectedVersion: 2 })).toEqual({
      ok: true,
      value: { version: 3 },
    });
  });

  it('refuses a Monday that has no row when a version is named', async () => {
    const head = await fx.headmaster();
    expect(await details(head, { expectedVersion: 3 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it('refuses a skipped or generated porada as issue-not-open, and a Monday outside the calendar', async () => {
    const head = await fx.headmaster();
    await world.run(setSkipped, world.as(head), {
      monday: monday(WEEK_2),
      event: 'skip',
      confirmed: true,
    });
    await fx.seedIssue(WEEK_3, 'generated');
    const notOpen = { ok: false, error: { code: 'rule', rule: 'issue-not-open' } };
    expect(await details(head, {}, WEEK_2)).toEqual(notOpen);
    expect(await details(head, {}, WEEK_3)).toEqual(notOpen);
    expect(
      await world.run(setIssueDetails, world.as(head), {
        monday: '2030-01-07',
        present: '',
        guests: '',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await fx.auditOf('issue.details_saved')).toEqual([]);
  });
});
