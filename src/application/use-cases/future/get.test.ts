import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce, readyJednani } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { getFuture, saveFuture } from './index';

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
        content: readyAkce(),
        timeline: [
          {
            event: 'return',
            fromState: 'submitted',
            toState: 'returned',
            note: 'Doplňte prosím místo.',
            editedFields: null,
            createdAt: world.clock.now().toISOString(),
          },
        ],
      },
    });
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

  it('shows everyone an approved akce with who is responsible, but not its history', async () => {
    const author = await user();
    const id = await item(author, 'approved');
    await returnedWithNote(id);
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    const result = await open(student, id);
    expect(result).toMatchObject({
      ok: true,
      value: {
        isAuthor: false,
        editable: false,
        timeline: [],
        content: { responsible: { verb: 'zajišťuje', people: [{ familyName: 'Novák' }] } },
      },
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
