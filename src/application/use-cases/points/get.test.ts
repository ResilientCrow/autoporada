import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { newDraft } from '@/domain/report';
import { calDate, wallTime } from '@/domain/time';

import {
  BULLETS,
  paragraph,
  pointFixtures,
  readyProposal,
  readyReport,
  START,
  wire,
} from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { getPoint, retractPoint, savePoint, submitPoint, withdrawPoint } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const read = (by: UserRecord, id: string) => world.run(getPoint, world.as(by), { id });
const notFound = { ok: false, error: { code: 'not-found' } };
const BOLD = { type: 'text', text: 'tučně', marks: [{ type: 'bold' }] };
/** A report with every field the editor sends: dates, times, campus, place, marks, an empty paragraph. */
const FULL_REPORT = readyReport({
  endDate: '2027-01-15',
  timeFrom: '08:00',
  timeTo: '14:30',
  campus: 'radlice',
  place: 'v aule',
  openingEdited: true,
  body: {
    type: 'doc',
    content: [
      paragraph('Další odstavec.'),
      { type: 'paragraph', attrs: { indent: 0 } },
      { type: 'paragraph', attrs: { indent: 0 }, content: [BOLD] },
    ],
  },
});

/** A pokyn of the author's, submitted through the use case: version 2. */
async function submitted(author: UserRecord): Promise<string> {
  const id = await start(author, 'pokyn');
  const input = { id, expectedVersion: 1, content: readyProposal() };
  if (!(await world.run(submitPoint, world.as(author), input)).ok) throw new Error('submit');
  return id;
}

/** A report started on a type that is no longer on offer, as when an admin retired it since. */
async function onRetiredType(author: UserRecord) {
  const type = await world.seed.pointType({
    name: 'Exkurze',
    position: 2,
    titleGender: 'f',
    defaultBullets: BULLETS,
    active: false,
  });
  const point = await world.tx(world.as(author), async (tx) => {
    const { point } = await tx.points.create({
      clientRef: randomUUID(),
      kind: 'report',
      typeId: type.id,
      content: newDraft(type.defaultBullets),
    });
    await tx.audit.record({ action: 'point.created', target: { type: 'point', id: point.id } });
    return point;
  });
  return { type, id: point.id };
}

describe('points.get', () => {
  describe('the author', () => {
    it('gets a draft report with its content as the editor sends it, and its type', async () => {
      const author = await user();
      const id = await start(author);
      const content = FULL_REPORT;
      world.clock.advance(60_000);
      const saved = await world.run(savePoint, world.as(author), {
        id,
        expectedVersion: 1,
        content,
      });
      expect(saved.ok).toBe(true);
      const { point } = await snapshot(id);

      expect(await read(author, id)).toEqual({
        ok: true,
        value: {
          id,
          kind: 'report',
          state: 'draft',
          version: 2,
          updatedAt: new Date(START.getTime() + 60_000).toISOString(),
          earliestMonday: null,
          submittedAt: null,
          isAuthor: true,
          editable: true,
          content,
          type: { id: point!.typeId, name: 'Seminář', titleGender: null, defaultBullets: BULLETS },
          timeline: [],
        },
      });
    });

    it.each([
      ['a fresh draft', null],
      ['a full report', FULL_REPORT],
    ])('gets %s as content the editor can send back unchanged', async (_what, content) => {
      const author = await user();
      const id = await start(author);
      const save = (expectedVersion: number, sent: unknown) =>
        world.run(savePoint, world.as(author), { id, expectedVersion, content: sent });
      if (content && !(await save(1, content)).ok) throw new Error('save');
      const got = await read(author, id);
      if (!got.ok) throw new Error('get');
      const stored = (await snapshot(id)).point?.content;

      expect(await save(got.value.version, got.value.content)).toEqual({
        ok: true,
        value: { version: got.value.version + 1 },
      });
      expect((await snapshot(id)).point?.content).toEqual(stored);
    });

    it('gets a proposal without a type, and a report on a retired type with that type', async () => {
      const author = await user();
      const pokyn = await read(author, await start(author, 'pokyn'));
      expect(pokyn).toMatchObject({ ok: true, value: { kind: 'pokyn', type: null } });
      expect(pokyn.ok && pokyn.value.content).toEqual(wire());

      const { type, id } = await onRetiredType(author);
      expect(await read(author, id)).toMatchObject({
        ok: true,
        value: {
          type: { id: type.id, name: 'Exkurze', titleGender: 'f', defaultBullets: BULLETS },
        },
      });
    });

    it('gets a handed-in point read-only, with when it was handed in and its Monday', async () => {
      const author = await user();
      const id = await submitted(author);
      expect(await read(author, id)).toMatchObject({
        ok: true,
        value: {
          state: 'submitted',
          version: 2,
          earliestMonday: '2026-10-26',
          submittedAt: START.toISOString(),
          isAuthor: true,
          editable: false,
        },
      });
    });

    it('gets a returned point to edit again', async () => {
      const author = await user();
      const id = await submitted(author);
      await moveTo(author, id, 'returned');
      expect(await read(author, id)).toMatchObject({
        ok: true,
        value: { state: 'returned', isAuthor: true, editable: true },
      });
    });
  });

  it('gives the timeline newest first, naming no one, with a review edit’s previous values as the editor reads them', async () => {
    const author = await user();
    const id = await submitted(author);
    const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000).toISOString();
    world.clock.advance(60_000);
    await world.run(retractPoint, world.as(author), { id, expectedVersion: 2 });
    world.clock.advance(60_000);
    const again = { id, expectedVersion: 3, content: readyProposal() };
    await world.run(submitPoint, world.as(author), again);
    world.clock.advance(60_000);
    const reviewer = await user('reviewer');
    await world.tx(world.as(reviewer), async (tx) => {
      await tx.pointEvents.append({
        pointId: id,
        event: 'edit',
        fromState: 'submitted',
        toState: 'submitted',
        editedFields: ['title', 'eventDate', 'timeFrom'],
        before: {
          title: 'Nákup projektoru',
          eventDate: calDate(2027, 1, 14),
          timeFrom: wallTime(8, 5),
        },
      });
      await tx.audit.record({ action: 'point.edited', target: { type: 'point', id } });
    });
    world.clock.advance(60_000);
    await world.tx(world.as(reviewer), async (tx) => {
      const note = 'Doplňte cenu.';
      await tx.pointEvents.append({
        pointId: id,
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        note,
      });
      await tx.audit.record({ action: 'point.returned', target: { type: 'point', id } });
    });
    world.clock.advance(60_000);
    await world.tx(world.as(reviewer), async (tx) => {
      await tx.pointEvents.append({
        pointId: id,
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        returnParts: ['heading', 'body'],
      });
      await tx.audit.record({ action: 'point.returned', target: { type: 'point', id } });
    });

    const event = (name: string, from: string, to: string, minutes: number) => ({
      event: name,
      fromState: from,
      toState: to,
      note: null,
      parts: null,
      editedFields: null,
      before: null,
      createdAt: at(minutes),
    });
    const got = await read(author, id);
    expect(got.ok && got.value.timeline).toEqual([
      { ...event('return', 'submitted', 'returned', 5), parts: ['heading', 'body'] },
      { ...event('return', 'submitted', 'returned', 4), note: 'Doplňte cenu.' },
      {
        ...event('edit', 'submitted', 'submitted', 3),
        editedFields: ['title', 'eventDate', 'timeFrom'],
        before: { title: 'Nákup projektoru', eventDate: '2027-01-14', timeFrom: '08:05' },
      },
      event('submit', 'draft', 'submitted', 2),
      event('retract', 'submitted', 'draft', 1),
      event('submit', 'draft', 'submitted', 0),
    ]);
  });

  describe('scope', () => {
    it.each(['reviewer', 'headmaster'] as const)(
      'does not find a colleague’s draft for a %s',
      async (role) => {
        const author = await user();
        const id = await start(author, 'pokyn');
        expect(await read(await user(role), id)).toEqual(notFound);
      },
    );

    it('does not find a retracted point for a reviewer, though it was handed in once', async () => {
      const author = await user();
      const id = await submitted(author);
      await world.run(retractPoint, world.as(author), { id, expectedVersion: 2 });
      expect(await read(await user('reviewer'), id)).toEqual(notFound);
      expect(await read(author, id)).toMatchObject({
        ok: true,
        value: { state: 'draft', submittedAt: null, editable: true },
      });
    });

    it('does not find a point withdrawn before it was handed in for a reviewer', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      const input = { id, expectedVersion: 1, confirmed: true };
      expect((await world.run(withdrawPoint, world.as(author), input)).ok).toBe(true);
      expect(await read(await user('reviewer'), id)).toEqual(notFound);
    });

    it.each(['submitted', 'returned', 'withdrawn'] as const)(
      'shows a reviewer a colleague’s %s point, read-only',
      async (state) => {
        const author = await user();
        const id = await submitted(author);
        if (state === 'returned') await moveTo(author, id, state);
        if (state === 'withdrawn') {
          const input = { id, expectedVersion: 2, confirmed: true };
          expect((await world.run(withdrawPoint, world.as(author), input)).ok).toBe(true);
        }
        expect(await read(await user('reviewer'), id)).toMatchObject({
          ok: true,
          value: { id, state, isAuthor: false, editable: false },
        });
      },
    );

    it('does not find a colleague’s handed-in point for a teacher, nor an unknown point', async () => {
      const author = await user();
      const id = await submitted(author);
      expect(await read(await user(), id)).toEqual(notFound);
      expect(await read(author, randomUUID())).toEqual(notFound);
    });

    it.each([
      ['whose account went back to pending', { role: 'pending' }],
      ['whose account was deactivated', { status: 'deactivated' }],
    ] as const)('does not find their own point for an author %s', async (_case, patch) => {
      const author = await user();
      const id = await start(author, 'pokyn');
      const demoted = await world.tx(system('test.seed'), (tx) =>
        tx.users.changeAccess(author.id, author.version, patch),
      );
      expect(await read(demoted, id)).toEqual(notFound);
    });
  });

  it('writes nothing', async () => {
    const author = await user();
    const id = await submitted(author);
    const before = await snapshot(id);
    await read(author, id);
    await read(await user('reviewer'), id);
    expect(await snapshot(id)).toEqual(before);
  });

  it('cannot run for the system', async () => {
    await expect(world.run(getPoint, system('cli:test'), { id: randomUUID() })).rejects.toThrow(
      'points.get: runs as a signed-in user',
    );
  });
});
