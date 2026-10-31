import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { MY_POINTS_PAGE } from '@/contracts';
import { newDraft } from '@/domain/report';
import { calDate } from '@/domain/time';

import { pointFixtures, readyProposal, START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { listMyPoints, submitPoint } from './index';

const world = setupWorld();
const { start, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const list = (by: UserRecord, before?: string) =>
  world.run(listMyPoints, world.as(by), before === undefined ? {} : { before });
const minutes = (n: number) => new Date(START.getTime() + n * 60_000).toISOString();

/** `count` empty pokyn drafts of the author's in one go, past the draft cap. */
const drafts = (author: UserRecord, count: number) =>
  world.tx(world.as(author), async (tx) => {
    for (let i = 0; i < count; i++) {
      const { point } = await tx.points.create({
        clientRef: randomUUID(),
        kind: 'pokyn',
        typeId: null,
        content: newDraft([]),
      });
      await tx.audit.record({ action: 'point.created', target: { type: 'point', id: point.id } });
    }
  });

describe('points.listMine', () => {
  it('lists the author’s own points, last changed first, without their content', async () => {
    const author = await user('reviewer');
    const report = await start(author);
    world.clock.advance(60_000);
    const pokyn = await start(author, 'pokyn');
    world.clock.advance(60_000);
    const input = { id: pokyn, expectedVersion: 1, content: readyProposal() };
    expect((await world.run(submitPoint, world.as(author), input)).ok).toBe(true);
    const colleague = await user();
    const theirs = await start(colleague, 'pokyn');
    await world.run(submitPoint, world.as(colleague), { ...input, id: theirs });
    const { point } = await snapshot(report);

    expect(await list(author)).toEqual({
      ok: true,
      value: {
        points: [
          {
            id: pokyn,
            kind: 'pokyn',
            typeId: null,
            state: 'submitted',
            title: 'Nákup projektoru',
            eventDate: null,
            earliestMonday: '2026-10-26',
            handInMonday: '2026-10-26',
            returnNote: null,
            version: 2,
            updatedAt: minutes(2),
          },
          {
            id: report,
            kind: 'report',
            typeId: point!.typeId,
            state: 'draft',
            title: '',
            eventDate: null,
            earliestMonday: null,
            handInMonday: null,
            returnNote: null,
            version: 1,
            updatedAt: minutes(0),
          },
        ],
        next: null,
      },
    });
  });

  it('gives the report’s event date as ISO text', async () => {
    const author = await user();
    const id = await start(author);
    await world.tx(world.as(author), async (tx) => {
      const point = (await tx.points.get(id))!;
      const content = { ...point.content, eventDate: calDate(2027, 1, 14) };
      await tx.points.update(id, point.version, { content });
      await tx.audit.record({ action: 'point.save', target: { type: 'point', id } });
    });
    const got = await list(author);
    expect(got.ok && got.value.points[0]?.eventDate).toBe('2027-01-14');
  });

  describe('the return note', () => {
    /** The author's pokyn, returned by a reviewer with this note. */
    async function returned(author: UserRecord, note: string) {
      const id = await start(author, 'pokyn');
      await world.tx(world.as(author), async (tx) => {
        const point = (await tx.points.get(id))!;
        await tx.points.update(id, point.version, { state: 'returned' });
        await tx.pointEvents.append({
          pointId: id,
          event: 'return',
          fromState: 'submitted',
          toState: 'returned',
          note,
        });
        await tx.audit.record({ action: 'point.save', target: { type: 'point', id } });
      });
      return id;
    }
    const noteOf = async (author: UserRecord, id: string) => {
      const got = await list(author);
      return got.ok ? got.value.points.find((p) => p.id === id)?.returnNote : undefined;
    };

    it('is the first line of the note of a returned point', async () => {
      const author = await user();
      const id = await returned(author, 'Doplňte prosím vyjádření.\nA zkontrolujte jména.');
      expect(await noteOf(author, id)).toBe('Doplňte prosím vyjádření.');
    });

    it.each([
      ['a leading blank line', '\n\nDoplňte název.\nDál.', 'Doplňte název.'],
      ['carriage returns', 'První\r\nDruhý', 'První'],
      ['surrounding spaces', '  Doplňte název.  ', 'Doplňte název.'],
    ])('reads the first line past %s', async (_case, note, expected) => {
      const author = await user();
      expect(await noteOf(author, await returned(author, note))).toBe(expected);
    });

    it('is null for a point that is not returned', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      expect(await noteOf(author, id)).toBeNull();
    });
  });

  it('pages the list: a full page names where the next one starts', async () => {
    const author = await user();
    await drafts(author, MY_POINTS_PAGE + 1);
    const first = await list(author);
    if (!first.ok || first.value.next === null) throw new Error('no next page');
    expect(first.value.points).toHaveLength(MY_POINTS_PAGE);

    const second = await list(author, first.value.next);
    if (!second.ok) throw new Error('second page');
    expect(second.value.next).toBeNull();
    expect(second.value.points).toHaveLength(1);
    const ids = [...first.value.points, ...second.value.points].map((p) => p.id);
    expect(new Set(ids).size).toBe(MY_POINTS_PAGE + 1);
    // One instant for every row: the order falls to the ids, highest first.
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it('names no next page for exactly one full page of points', async () => {
    const author = await user();
    await drafts(author, MY_POINTS_PAGE);
    const only = await list(author);
    if (!only.ok) throw new Error('the page');
    expect(only.value.points).toHaveLength(MY_POINTS_PAGE);
    expect(only.value.next).toBeNull();
  });

  it('holds the extra row back from the first page and starts the second with it', async () => {
    const author = await user();
    await drafts(author, MY_POINTS_PAGE + 1);
    const first = await list(author);
    if (!first.ok || first.value.next === null) throw new Error('no next page');
    const second = await list(author, first.value.next);
    if (!second.ok) throw new Error('second page');
    const all = await world.tx(world.as(author), (tx) => tx.points.listMine(MY_POINTS_PAGE + 1));
    expect(first.value.points.map((p) => p.id)).toEqual(
      all.slice(0, MY_POINTS_PAGE).map((p) => p.id),
    );
    expect(second.value.points.map((p) => p.id)).toEqual([all[MY_POINTS_PAGE]?.id]);
  });

  it('gives an author with no points an empty list', async () => {
    expect(await list(await user())).toEqual({ ok: true, value: { points: [], next: null } });
  });

  it.each([
    ['empty', '', 'invalid'],
    ['without an id', '1792396800000', 'invalid'],
    ['with a bad id', '1792396800000.not-a-uuid', 'invalid'],
    // These match the cursor's shape; only the uuid check stops them before the database.
    ['with an id of dashes', `1792396800000.${'-'.repeat(36)}`, 'invalid'],
    ['with an id of hex and no dashes', `1792396800000.${'a'.repeat(36)}`, 'invalid'],
    ['with a bad time', `17923968x0000.${randomUUID()}`, 'invalid'],
    ['too long', `1792396800000.${randomUUID()}${'0'.repeat(40)}`, 'too-long'],
  ])('refuses a cursor %s on `before`', async (_case, before, code) => {
    expect(await list(await user(), before)).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { before: code } },
    });
  });

  describe('gate', () => {
    it('lets a student submitter list their own points', async () => {
      const student = await world.seed.user({ role: 'submitter', isStudent: true });
      const id = await start(student, 'pokyn');
      const got = await list(student);
      expect(got.ok && got.value.points.map((p) => p.id)).toEqual([id]);
    });

    it.each([
      ['pending', { role: 'pending' }],
      ['deactivated', { role: 'submitter', status: 'deactivated' }],
    ] as const)('refuses a %s user', async (_, seed) => {
      expect(await list(await world.seed.user(seed))).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });

    it('cannot run for the system', async () => {
      await expect(world.run(listMyPoints, system('cli:test'), {})).rejects.toThrow(
        'points.listMine: runs as a signed-in user',
      );
    });
  });

  it('writes nothing', async () => {
    const author = await user();
    const id = await start(author, 'pokyn');
    const before = await snapshot(id);
    await list(author);
    expect(await snapshot(id)).toEqual(before);
  });
});
