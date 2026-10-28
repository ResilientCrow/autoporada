import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { POINT_LIMITS, type BulletSpec, type PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { parseIsoDate, parseWallTime } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { createPoint, savePoint } from './index';

const world = setupWorld();

const BULLETS: readonly BulletSpec[] = [
  { key: 'organisers', label: 'Organizátoři', kind: 'people', required: true, role: 'organisers' },
  { key: 'results', label: 'Výsledky', kind: 'text', required: false },
];
const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });

/** What the editor sends for an empty point: dates and times as ISO text. */
const wire = (over: Record<string, unknown> = {}) => ({
  title: '',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [],
  statements: [],
  ...over,
});
const paragraph = (text: string, indent = 0) => ({
  type: 'paragraph',
  attrs: { indent },
  content: [{ type: 'text', text }],
});
const person = { salutation: 'pani', givenName: 'Eva', familyName: 'Malá' };
const organisers = (people: readonly unknown[] = [person]) => ({
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  order: 'input',
  people,
});
const statement = { speaker: person, speakerGenitive: 'paní Evy Malé', quote: 'Bylo to skvělé.' };

/** A new point of the author's, made through the use case. */
async function start(author: UserRecord, kind: PointKind = 'report'): Promise<string> {
  const typeId =
    kind === 'report'
      ? (await world.seed.pointType({ name: 'Seminář', position: 1, defaultBullets: BULLETS })).id
      : null;
  const result = await world.run(createPoint, world.as(author), {
    clientRef: randomUUID(),
    kind,
    typeId,
  });
  if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
  return result.value.id;
}

const save = (by: UserRecord, id: string, content: unknown, expectedVersion = 1) =>
  world.run(savePoint, world.as(by), { id, expectedVersion, content });

const load = (author: UserRecord, id: string) =>
  world.tx(world.as(author), (tx) => tx.points.get(id), 'read');

/** Moves the author's point to `state` past the use cases, as a review would leave it. */
async function moveTo(author: UserRecord, id: string, state: PointState): Promise<void> {
  await world.tx(world.as(author), async (tx) => {
    const point = (await tx.points.loadForWrite(id))!;
    const content = { ...point.content, title: 'Den', eventDate: parseIsoDate('2027-01-14') };
    await tx.points.update(id, point.version, {
      content: { ...content, opening: 'Ve čtvrtek…' },
      state,
      submittedAt: world.clock.now(),
      earliestMonday: parseIsoDate('2026-10-26'),
    });
    await tx.audit.record({ action: `point.${state}`, target: { type: 'point', id } });
  });
}

/** Expects the save to fail with `error` and to change neither the point nor the audit log. */
async function refuses(
  author: UserRecord,
  run: () => Promise<unknown>,
  id: string,
  error: unknown,
) {
  const before = { point: await load(author, id), audit: await world.inspect.audit() };
  expect(await run()).toEqual({ ok: false, error });
  expect({ point: await load(author, id), audit: await world.inspect.audit() }).toEqual(before);
}
const utf8 = (text: string) => new TextEncoder().encode(text).length;
const invalid = (fields: Record<string, string>) => ({ code: 'invalid-input', fields });
const notEditable = { code: 'rule', rule: 'point-not-editable' };

describe('points.save', () => {
  describe('saving', () => {
    it('stores every field of a report and answers with the new version', async () => {
      const author = await user();
      const id = await start(author);
      const content = wire({
        title: 'Den otevřených dveří',
        eventDate: '2027-01-14',
        endDate: '2027-01-15',
        timeFrom: '9:00',
        timeTo: '14:30',
        campus: 'radlice',
        place: 'v učebně S206',
        opening: 'Ve čtvrtek…',
        openingEdited: true,
        body: { type: 'doc', content: [paragraph('Přišlo 40 lidí.')] },
        bullets: [organisers(), { key: 'own', label: 'Hosté', kind: 'text', text: 'rodiče' }],
        statements: [statement],
      });
      expect(await save(author, id, content)).toEqual({ ok: true, value: { version: 2 } });
      const point = await load(author, id);
      expect(point).toMatchObject({ state: 'draft', version: 2 });
      expect(point?.content).toEqual({
        ...content,
        eventDate: parseIsoDate('2027-01-14'),
        endDate: parseIsoDate('2027-01-15'),
        timeFrom: parseWallTime('9:00'),
        timeTo: parseWallTime('14:30'),
      });
    });

    it('takes each answered version for the next save, and refuses the old one', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      expect(await save(author, id, wire({ title: 'A' }))).toEqual({
        ok: true,
        value: { version: 2 },
      });
      expect(await save(author, id, wire({ title: 'B' }), 2)).toEqual({
        ok: true,
        value: { version: 3 },
      });
      await refuses(author, () => save(author, id, wire({ title: 'C' }), 2), id, {
        code: 'conflict',
      });
    });

    it('saves a point the reviewers returned', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, 'returned');
      expect(await save(author, id, wire({ title: 'Opraveno' }), 2)).toEqual({
        ok: true,
        value: { version: 3 },
      });
    });

    it('strips forbidden characters from the text fields', async () => {
      const author = await user();
      const id = await start(author);
      const bidi = '\u202E';
      await save(
        author,
        id,
        wire({
          title: `Den${bidi} otevřených`,
          bullets: [organisers([{ ...person, familyName: `Ma${bidi}lá` }])],
          statements: [{ ...statement, quote: `Bylo${bidi} to skvělé.` }],
        }),
      );
      const point = await load(author, id);
      expect(point?.content.title).toBe('Den otevřených');
      expect(point?.content.bullets).toEqual([organisers()]);
      expect(point?.content.statements).toEqual([statement]);
    });

    it('writes no audit row: an autosave is exempt', async () => {
      const author = await user();
      const id = await start(author);
      const audit = await world.inspect.audit();
      expect((await save(author, id, wire({ title: 'Den' }))).ok).toBe(true);
      expect(await world.inspect.audit()).toEqual(audit);
    });
  });

  describe('version, author and state', () => {
    it('answers a stale version with conflict before it looks at the state or the author', async () => {
      const author = await user('reviewer');
      const id = await start(author, 'pokyn');
      await moveTo(author, id, 'submitted');
      await refuses(author, () => save(author, id, wire(), 1), id, { code: 'conflict' });
      const colleague = await user('reviewer');
      await refuses(author, () => save(colleague, id, wire(), 1), id, { code: 'conflict' });
    });

    it.each(['submitted', 'approved', 'rejected', 'withdrawn', 'published'] as const)(
      'refuses the author’s %s point as no longer editable',
      async (state) => {
        const author = await user();
        const id = await start(author, 'pokyn');
        await moveTo(author, id, state);
        await refuses(author, () => save(author, id, wire(), 2), id, notEditable);
      },
    );

    it.each([
      ['reviewer', 'submitted'],
      ['headmaster', 'approved'],
    ] as const)(
      'refuses a %s’s own %s point, which only review may change',
      async (role, state) => {
        const author = await user(role);
        const id = await start(author, 'pokyn');
        await moveTo(author, id, state);
        await refuses(author, () => save(author, id, wire(), 2), id, notEditable);
      },
    );

    it.each([
      ['reviewer', 'submitted'],
      ['reviewer', 'returned'],
      ['headmaster', 'approved'],
    ] as const)('refuses a %s who is not the author of a %s point', async (role, state) => {
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, state);
      const reviewer = await user(role);
      await refuses(author, () => save(reviewer, id, wire(), 2), id, { code: 'forbidden' });
    });

    it.each([
      ['whose account went back to pending', { role: 'pending' }],
      ['whose account was deactivated', { status: 'deactivated' }],
    ] as const)('does not find their own point for an author %s', async (_case, patch) => {
      // The scoped repository gives such an account no points at all, so the
      // save never reaches the author or state check.
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, 'returned');
      const demoted = await world.tx(system('test.seed'), (tx) =>
        tx.users.changeAccess(author.id, author.version, patch),
      );
      await refuses(author, () => save(demoted, id, wire({ title: 'Ne' }), 2), id, {
        code: 'not-found',
      });
    });

    it('does not find a colleague’s draft, nor an unknown point', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      const headmaster = await user('headmaster');
      await refuses(author, () => save(headmaster, id, wire()), id, { code: 'not-found' });
      expect(await save(author, randomUUID(), wire())).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
    });

    it('cannot run for the system', async () => {
      const input = { id: randomUUID(), expectedVersion: 1, content: wire() };
      await expect(world.run(savePoint, system('cli:test'), input)).rejects.toThrow(
        'points.save: runs as a signed-in user',
      );
    });
  });

  describe('content by kind', () => {
    it('keeps a report’s body to plain paragraphs; finance and pokyn may indent', async () => {
      const author = await user();
      const body = { type: 'doc', content: [paragraph('Úvod'), paragraph('bod', 3)] };
      const report = await start(author);
      await refuses(
        author,
        () => save(author, report, wire({ body })),
        report,
        invalid({ 'content.body': 'invalid' }),
      );
      for (const kind of ['finance', 'pokyn'] as const) {
        expect((await save(author, await start(author, kind), wire({ body }))).ok).toBe(true);
      }
    });

    it('refuses a bullet that takes a type bullet’s key with another kind', async () => {
      const author = await user();
      const id = await start(author);
      const swapped = [{ key: 'organisers', label: 'Organizátoři', kind: 'text', text: 'Eva' }];
      await refuses(
        author,
        () => save(author, id, wire({ bullets: swapped })),
        id,
        invalid({ 'content.bullets': 'invalid' }),
      );
      // A custom bullet and a missing required one are for readiness, not for the save.
      const custom = [
        { key: 'guests', label: 'Hosté', kind: 'people', order: 'input', people: [] },
      ];
      expect((await save(author, id, wire({ bullets: custom }))).ok).toBe(true);
    });

    it.each(['finance', 'pokyn'] as const)('refuses bullets and statements on %s', async (kind) => {
      const author = await user();
      const id = await start(author, kind);
      const bullets = [organisers()];
      await refuses(
        author,
        () => save(author, id, wire({ bullets })),
        id,
        invalid({ 'content.bullets': 'invalid' }),
      );
      const statements = [statement];
      await refuses(
        author,
        () => save(author, id, wire({ statements })),
        id,
        invalid({ 'content.statements': 'invalid' }),
      );
    });
  });

  describe('bounds', () => {
    it.each([
      [
        'an end before the start',
        { eventDate: '2027-01-14', endDate: '2027-01-13' },
        'content.endDate',
      ],
      ['an end with no start', { endDate: '2027-01-13' }, 'content.endDate'],
      ['a day that does not exist', { eventDate: '2027-02-29' }, 'content.eventDate'],
      ['a time that does not exist', { timeFrom: '24:00' }, 'content.timeFrom'],
      ['a title over its cap', { title: 'x'.repeat(POINT_LIMITS.title + 1) }, 'content.title'],
    ])('refuses %s', async (_name, over, field) => {
      const author = await user();
      const id = await start(author);
      const result = await save(author, id, wire(over));
      expect(!result.ok && result.error.code === 'invalid-input' && result.error.fields).toEqual({
        [field]: field === 'content.title' ? 'too-long' : 'invalid',
      });
    });

    it('takes an end on the same day as the start', async () => {
      const author = await user();
      const id = await start(author);
      const day = '2027-01-14';
      expect(await save(author, id, wire({ eventDate: day, endDate: day }))).toEqual({
        ok: true,
        value: { version: 2 },
      });
      expect((await load(author, id))?.content.endDate).toEqual(parseIsoDate(day));
    });

    it('takes the largest point the caps allow, within the action’s 512 KB, and not a byte more', async () => {
      const author = await user();
      const id = await start(author);
      const content = worstCase();
      expect(utf8(JSON.stringify(content))).toBe(POINT_LIMITS.contentBytes);
      const input = { id, expectedVersion: 1, content };
      // React's reply encoding adds at most one `$` to each string.
      const strings = JSON.stringify(input).split('"').length / 2;
      expect(utf8(JSON.stringify([input])) + strings).toBeLessThan(512 * 1024);
      expect(await save(author, id, content)).toEqual({ ok: true, value: { version: 2 } });
      const over = { ...content, title: `${content.title}x` };
      expect(await save(author, id, over, 2)).toEqual({
        ok: false,
        error: invalid({ content: 'too-long' }),
      });
    });
  });
});

/**
 * Every bullet label and key and every person field at its cap, as many such
 * people as fit, then body text up to exactly the total cap. The dates are
 * empty, so the wire form and the stored form measure the same.
 */
function worstCase() {
  const { person: cap } = POINT_LIMITS;
  const x = (n: number) => 'x'.repeat(n);
  const full = {
    graphId: randomUUID(),
    salutation: 'pan',
    titlesBefore: x(cap.title),
    givenName: x(cap.name),
    familyName: x(cap.name),
    titlesAfter: x(cap.title),
    affiliation: x(cap.affiliation),
    affiliationYear: '2026/2027', // a school year is always POINT_LIMITS.affiliationYear long
  };
  const bullets = Array.from({ length: POINT_LIMITS.bullets }, (_, i) => ({
    key: `k${i}`.padEnd(POINT_LIMITS.bulletKey, 'x'),
    label: x(POINT_LIMITS.bulletLabel),
    kind: 'people',
    order: 'class-surname',
    people: [] as (typeof full)[],
  }));
  const statements = Array.from({ length: POINT_LIMITS.statements }, () => ({
    speaker: full,
    speakerGenitive: x(POINT_LIMITS.speakerGenitive),
    affiliation: x(POINT_LIMITS.statementAffiliation),
    quote: x(POINT_LIMITS.quote),
  }));
  const content = wire({
    title: x(POINT_LIMITS.title - 1),
    place: x(POINT_LIMITS.place),
    opening: x(POINT_LIMITS.opening),
    body: { type: 'doc', content: [paragraph('x')] },
    bullets,
    statements,
  });
  const bytes = () => utf8(JSON.stringify(content));
  for (let i = 0; bytes() < POINT_LIMITS.contentBytes - 1000; i++) {
    bullets[i % bullets.length]!.people.push(full);
  }
  const pad = POINT_LIMITS.contentBytes - bytes();
  return { ...content, body: { type: 'doc', content: [paragraph(x(pad + 1))] } };
}
