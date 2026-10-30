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
        view: {
          ...readyAkce({ responsible: undefined }),
          responsible: { verb: 'zajišťuje', behalfOf: '2.A', names: ['Jan Novák'] },
        },
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

  describe('an approved akce read by someone else', () => {
    const person = {
      graphId: '11111111-1111-4111-8111-111111111111',
      salutation: 'pan',
      titlesBefore: 'Mgr.',
      givenName: 'Jan',
      familyName: 'Novák',
      affiliation: 'kabinet fyziky',
      affiliationYear: '2026/2027',
    };
    const readers = [
      ['a colleague', { role: 'submitter' }],
      ['a student', { role: 'submitter', isStudent: true }],
    ] as const;

    /** An approved akce whose responsible person has everything the directory gave. */
    async function approvedWithPerson(): Promise<{ id: string; author: UserRecord }> {
      const author = await user();
      const id = await start(author, 'akce');
      const content = readyAkce({
        responsible: { verb: 'vede', behalfOf: '2.A', people: [person] },
      });
      await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
      await moveTo(author, id, 'approved');
      await returnedWithNote(id);
      return { id, author };
    }

    it.each(readers)(
      'gives %s the names of who is responsible, and not its history',
      async (_who, seed) => {
        const { id } = await approvedWithPerson();
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
              responsible: { verb: 'vede', behalfOf: '2.A', names: ['Mgr. Jan Novák'] },
            },
          },
        });
      },
    );

    it.each(readers)('hands %s no directory id, affiliation or salutation', async (_who, seed) => {
      const { id } = await approvedWithPerson();
      const reader = await world.seed.user(seed);
      const json = JSON.stringify(await open(reader, id));
      for (const secret of [person.graphId, person.affiliation, person.affiliationYear, '"pan"']) {
        expect(json).not.toContain(secret);
      }
    });

    it('still gives the author the full content, the directory id included', async () => {
      const { id, author } = await approvedWithPerson();
      const result = await open(author, id);
      expect(result).toMatchObject({
        ok: true,
        value: { content: { responsible: { people: [person] } } },
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
