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
            submittedAt: minutes(2),
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
            submittedAt: null,
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
