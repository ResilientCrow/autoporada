import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type Principal,
} from '@/application/ports';
import type { PointState } from '@/domain/review';

import { issueFixtures } from '../support/issues';
import { setupWorld } from '../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const cli = system('cli:test');

const standing = (ids: readonly string[], by: Principal = cli) =>
  world.tx(by, (tx) => tx.points.statesOf(ids), 'read');
/** A close in its own transaction; the write is audited as the use case will. */
const close = (id: string, version: number, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const closed = await tx.points.close(id, version);
    await tx.audit.record({ action: 'point.closed', target: { type: 'point', id } });
    return closed;
  });
const events = (id: string) => world.tx(cli, (tx) => tx.pointEvents.list(id), 'read');
const stored = async (id: string) => (await standing([id]))[0]!;

describe('PointRepo.statesOf (port contract)', () => {
  it('tells where each point stands whoever wrote it, drafts included', async () => {
    const one = await world.seed.user({ role: 'submitter' });
    const two = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    const draft = await fixtures.point({ author: one, kind: 'report', state: 'draft' });
    const submitted = await fixtures.point({ author: two, kind: 'report', state: 'submitted' });
    const approved = await fixtures.point({ author: two, kind: 'report', state: 'approved' });
    const expected = [
      { id: draft, state: 'draft', version: 1 },
      { id: submitted, state: 'submitted', version: 2 },
      { id: approved, state: 'approved', version: 2 },
    ];
    for (const by of [cli, world.as(head)]) {
      const got = await standing([draft, submitted, approved], by);
      expect([...got].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(
        [...expected].sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
    }
  });

  it('leaves out an unknown id and answers nothing for no ids', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    expect(await standing([randomUUID(), id])).toEqual([{ id, state: 'draft', version: 1 }]);
    expect(await standing([])).toEqual([]);
  });

  it('is read by whoever previews an issue and refused to the author', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    expect(await standing([id], world.as(reviewer))).toHaveLength(1);
    await expect(standing([id], world.as(author))).rejects.toBeInstanceOf(ScopeViolation);
  });
});

describe('PointRepo.close (port contract)', () => {
  it.each(['draft', 'returned', 'submitted'] as const)(
    'withdraws a %s point of someone else and records the close event',
    async (state) => {
      const author = await world.seed.user({ role: 'submitter' });
      const head = await world.seed.user({ role: 'headmaster' });
      const id = await fixtures.point({ author, kind: 'report', state });
      const before = await stored(id);
      const closed = await close(id, before.version, world.as(head));
      expect(closed).toEqual({ id, from: state, version: before.version + 1 });
      expect(await stored(id)).toEqual({ id, state: 'withdrawn', version: before.version + 1 });
      const [event] = await events(id);
      expect(event).toMatchObject({
        pointId: id,
        event: 'close',
        fromState: state,
        toState: 'withdrawn',
        actorId: head.id,
        note: null,
      });
    },
  );

  it('records no actor for the system', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    await close(id, 1);
    expect((await events(id))[0]).toMatchObject({ event: 'close', actorId: null });
  });

  it.each(['approved', 'rejected', 'withdrawn'] as const)(
    'is StaleVersion for a %s point, and writes no event',
    async (state: PointState) => {
      const author = await world.seed.user({ role: 'submitter' });
      const id = await fixtures.point({ author, kind: 'report', state });
      const before = await stored(id);
      await expect(close(id, before.version)).rejects.toBeInstanceOf(StaleVersion);
      expect(await stored(id)).toEqual(before);
      expect(await events(id)).toEqual([]);
    },
  );

  it('is StaleVersion for a moved version and for an unknown point', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    await expect(close(id, 2)).rejects.toBeInstanceOf(StaleVersion);
    await expect(close(randomUUID(), 1)).rejects.toBeInstanceOf(StaleVersion);
    expect(await stored(id)).toEqual({ id, state: 'draft', version: 1 });
    expect(await events(id)).toEqual([]);
  });

  it('closes a point once', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    await close(id, 1);
    await expect(close(id, 2)).rejects.toBeInstanceOf(StaleVersion);
    expect(await events(id)).toHaveLength(1);
  });

  it('refuses a user who may not generate', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    for (const by of [author, reviewer]) {
      await expect(close(id, 1, world.as(by))).rejects.toBeInstanceOf(ScopeViolation);
    }
    expect(await stored(id)).toEqual({ id, state: 'draft', version: 1 });
  });

  it('writes nothing in a read transaction', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await fixtures.point({ author, kind: 'report', state: 'draft' });
    await expect(world.tx(cli, (tx) => tx.points.close(id, 1), 'read')).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
  });
});
