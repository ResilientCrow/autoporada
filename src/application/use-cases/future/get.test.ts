import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce, readyJednani } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { getFuture, requestCancelFuture, saveFuture } from './index';

const world = setupWorld();
const { start, moveTo } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const open = (by: UserRecord, id: string) => world.run(getFuture, world.as(by), { id });

/** An item of the author's with `content`, moved to `state`. */
async function item(
  author: UserRecord,
  state: FutureState,
  kind: 'akce' | 'jednani' = 'akce',
): Promise<string> {
  const id = await start(author, kind);
  const content = kind === 'akce' ? readyAkce() : readyJednani();
  await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
  await moveTo(author, id, state);
  return id;
}

/** A reviewer's return of the item, as the review rows will write it. */
const returnedWithNote = (id: string) =>
  world.tx(system('test.seed'), async (tx) => {
    await tx.futureEvents.append({
      futureItemId: id,
      event: 'return',
      fromState: 'submitted',
      toState: 'returned',
      note: 'Doplňte prosím místo.',
    });
    await tx.audit.record({ action: 'future.returned', target: { type: 'future_item', id } });
  });

describe('future.get', () => {
  it('gives the author the content in the editor’s shape, where it stands, and the history', async () => {
    const author = await user();
    const id = await item(author, 'returned');
    world.clock.advance(60_000);
    await returnedWithNote(id);
    const result = await open(author, id);
    expect(result).toEqual({
      ok: true,
      value: {
        id,
        kind: 'akce',
        state: 'returned',
        version: 3,
        isAuthor: true,
        editable: true,
        updatedAt: expect.any(String),
        submittedAt: expect.any(String),
        reportState: 'none',
        reportPointId: null,
        cancelRequestedAt: null,
        content: readyAkce(),
        view: readyAkce(),
        timeline: [
          {
            event: 'return',
            fromState: 'submitted',
            toState: 'returned',
            note: 'Doplňte prosím místo.',
            parts: null,
            editedFields: null,
            createdAt: world.clock.now().toISOString(),
          },
        ],
      },
    });
  });

  it('gives the parts a return named, with no note, in the timeline', async () => {
    const author = await user();
    const id = await item(author, 'returned');
    await world.tx(system('test.seed'), async (tx) => {
      await tx.futureEvents.append({
        futureItemId: id,
        event: 'return',
        fromState: 'submitted',
        toState: 'returned',
        returnParts: ['title', 'who'],
      });
      await tx.audit.record({ action: 'future.returned', target: { type: 'future_item', id } });
    });
    const result = await open(author, id);
    expect(result.ok && result.value.timeline).toMatchObject([
      { event: 'return', note: null, parts: ['title', 'who'] },
    ]);
  });

  it.each([
    ['draft', true],
    ['returned', true],
    ['approved', true],
    ['submitted', false],
    ['rejected', false],
    ['withdrawn', false],
    ['cancelled', false],
  ] as const)('marks a %s item editable for its author: %s', async (state, editable) => {
    const author = await user();
    const id = await item(author, state);
    const result = await open(author, id);
    expect(result.ok && result.value.editable).toBe(editable);
  });

  it('shows a reviewer a handed-in item with its history, not editable by them', async () => {
    const author = await user();
    const id = await item(author, 'submitted');
    await returnedWithNote(id);
    const reviewer = await user('reviewer');
    const result = await open(reviewer, id);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id,
        isAuthor: false,
        editable: false,
        timeline: [{ note: 'Doplňte prosím místo.' }],
      },
    });
  });

  it('tells the author and the vedení when a cancel waits, keeps the author out of the editor, and tells a colleague nothing (ADR 0062)', async () => {
    const author = await user();
    const id = await item(author, 'approved');
    world.clock.advance(60_000);
    const asked = await world.run(requestCancelFuture, world.as(author), {
      id,
      expectedVersion: 3,
      confirmed: true,
    });
    expect(asked.ok).toBe(true);
    const at = world.clock.now().toISOString();
    expect(await open(author, id)).toMatchObject({
      ok: true,
      value: {
        state: 'approved',
        editable: false,
        cancelRequestedAt: at,
        timeline: [{ event: 'request-cancel', fromState: 'approved', toState: 'approved' }],
      },
    });
    expect(await open(await user('reviewer'), id)).toMatchObject({
      ok: true,
      value: { cancelRequestedAt: at },
    });
    expect(await open(await user(), id)).toMatchObject({
      ok: true,
      value: { state: 'approved', cancelRequestedAt: null, timeline: [] },
    });
  });

  it('does not find a draft for a reviewer, a colleague or a student', async () => {
    const author = await user();
    const id = await item(author, 'draft');
    for (const seed of [
      { role: 'reviewer' },
      { role: 'submitter' },
      { isStudent: true },
    ] as const) {
      const other = await world.seed.user(seed);
      expect(await open(other, id)).toEqual({ ok: false, error: { code: 'not-found' } });
    }
  });

  it('does not find a handed-in item for a colleague', async () => {
    const author = await user();
    const id = await item(author, 'submitted');
    const colleague = await user();
    expect(await open(colleague, id)).toEqual({ ok: false, error: { code: 'not-found' } });
  });

  describe('an approved akce read by someone else', () => {
    const readers = [
      ['a colleague', { role: 'submitter' }],
      ['a student', { role: 'submitter', isStudent: true }],
    ] as const;

    /** An approved akce with its three free-text fields filled. */
    async function approvedWithText(): Promise<{ id: string; author: UserRecord }> {
      const author = await user();
      const id = await start(author, 'akce');
      const content = readyAkce({
        organizer: 'organizuje pan Mgr. Jan Novák',
        participants: 'účast 2.A',
        note: 'téma stáže',
      });
      await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
      await moveTo(author, id, 'approved');
      await returnedWithNote(id);
      return { id, author };
    }

    it.each(readers)('gives %s the free text as typed, and not its history', async (_who, seed) => {
      const { id } = await approvedWithText();
      const reader = await world.seed.user(seed);
      const result = await open(reader, id);
      expect(result).toMatchObject({
        ok: true,
        value: {
          isAuthor: false,
          editable: false,
          timeline: [],
          content: null,
          view: {
            title: 'Výlet do Prahy',
            startDate: '2026-11-10',
            organizer: 'organizuje pan Mgr. Jan Novák',
            participants: 'účast 2.A',
            note: 'téma stáže',
          },
        },
      });
    });

    it('still gives the author the full content', async () => {
      const { id, author } = await approvedWithText();
      const result = await open(author, id);
      expect(result).toMatchObject({
        ok: true,
        value: { content: { organizer: 'organizuje pan Mgr. Jan Novák' } },
      });
    });
  });

  it('does not find an approved jednání for a colleague', async () => {
    const author = await user();
    const id = await item(author, 'approved', 'jednani');
    const colleague = await user();
    expect(await open(colleague, id)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect((await open(await user('reviewer'), id)).ok).toBe(true);
  });

  it('hides a cancelled akce from all but its author and reviewers', async () => {
    const author = await user();
    const id = await item(author, 'cancelled');
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    expect(await open(student, id)).toEqual({ ok: false, error: { code: 'not-found' } });
    expect((await open(author, id)).ok).toBe(true);
    expect((await open(await user('reviewer'), id)).ok).toBe(true);
  });

  it('does not find an item for an author whose account was deactivated', async () => {
    const author = await user();
    const id = await item(author, 'draft');
    const gone = await world.tx(system('test.seed'), (tx) =>
      tx.users.changeAccess(author.id, author.version, { status: 'deactivated' }),
    );
    expect(await open(gone, id)).toEqual({ ok: false, error: { code: 'not-found' } });
  });
});
