import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { FutureContent, UserRecord } from '@/application/ports';
import { FUTURE_LIST_PAGE } from '@/contracts';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce, readyJednani } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { listFuture, saveFuture } from './index';

const world = setupWorld();

const EMPTY_CONTENT: FutureContent = {
  title: '',
  startDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  participants: null,
  note: null,
};
const { start, moveTo } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const list = (by: UserRecord, before?: string) =>
  world.run(listFuture, world.as(by), before === undefined ? {} : { before });

async function item(
  author: UserRecord,
  state: FutureState,
  kind: 'akce' | 'jednani' = 'akce',
  title = `${kind} ${state}`,
): Promise<string> {
  const id = await start(author, kind);
  const content = kind === 'akce' ? readyAkce({ title }) : readyJednani({ title });
  await world.run(saveFuture, world.as(author), { id, expectedVersion: 1, content });
  if (state !== 'draft') await moveTo(author, id, state);
  world.clock.advance(1000);
  return id;
}

const titles = async (by: UserRecord) => {
  const result = await list(by);
  if (!result.ok) throw new Error(`list refused: ${result.error.code}`);
  return result.value.items.map((row) => row.title);
};

describe('future.list', () => {
  it('shows the author their own items in any state, last changed first', async () => {
    const author = await user();
    await item(author, 'draft');
    await item(author, 'rejected');
    await item(author, 'cancelled', 'jednani');
    expect(await titles(author)).toEqual(['jednani cancelled', 'akce rejected', 'akce draft']);
  });

  it('shows a student only the approved akce of others, and their own items', async () => {
    const author = await user();
    await item(author, 'draft');
    await item(author, 'submitted');
    await item(author, 'approved', 'jednani');
    await item(author, 'cancelled');
    await item(author, 'approved');
    const student = await world.seed.user({ role: 'submitter', isStudent: true });
    await item(student, 'draft', 'akce', 'moje');
    expect(await titles(student)).toEqual(['moje', 'akce approved']);
  });

  it('shows a reviewer what was handed in, never a colleague’s draft', async () => {
    const author = await user();
    await item(author, 'draft');
    await item(author, 'submitted');
    await item(author, 'approved', 'jednani');
    const reviewer = await user('reviewer');
    expect(await titles(reviewer)).toEqual(['jednani approved', 'akce submitted']);
  });

  it('shows the organizer as typed', async () => {
    const author = await user();
    await item(author, 'approved');
    const reader = await user();
    const result = await list(reader);
    expect(result).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            state: 'approved',
            isAuthor: false,
            organizer: 'zajišťuje 2.A paní učitelka Jana Nováková',
          },
        ],
      },
    });
  });

  describe('paging', () => {
    /** `count` empty jednání of the author's, all written at the clock's one instant. */
    const make = (author: UserRecord, count: number) =>
      world.tx(world.as(author), async (tx) => {
        for (let i = 0; i < count; i++) {
          const { item: made } = await tx.futureItems.create({
            clientRef: randomUUID(),
            kind: 'jednani',
            content: { ...EMPTY_CONTENT, title: String(i) },
          });
          await tx.audit.record({
            action: 'future.created',
            target: { type: 'future_item', id: made.id },
          });
        }
      });

    it('names no next page for exactly one full page', async () => {
      const author = await user();
      await make(author, FUTURE_LIST_PAGE);
      const result = await list(author);
      expect(result.ok && result.value.items).toHaveLength(FUTURE_LIST_PAGE);
      expect(result.ok && result.value.next).toBeNull();
    });

    it('names where the next page starts, and the next page holds the rest once', async () => {
      const author = await user();
      await make(author, FUTURE_LIST_PAGE + 1);
      const first = await list(author);
      if (!first.ok || first.value.next === null) throw new Error('no next page');
      expect(first.value.items).toHaveLength(FUTURE_LIST_PAGE);

      const second = await list(author, first.value.next);
      if (!second.ok) throw new Error('second page');
      expect(second.value.items).toHaveLength(1);
      expect(second.value.next).toBeNull();
      const ids = [...first.value.items, ...second.value.items].map((row) => row.id);
      expect(new Set(ids).size).toBe(FUTURE_LIST_PAGE + 1);
      // One instant for every row: the order falls to the ids, highest first.
      expect(ids).toEqual([...ids].sort().reverse());
    });

    it.each([
      ['empty', '', 'invalid'],
      ['without an id', '1792396800000', 'invalid'],
      ['with a bad id', '1792396800000.not-a-uuid', 'invalid'],
      ['too long', `1792396800000.${randomUUID()}${'0'.repeat(40)}`, 'too-long'],
    ])('refuses a cursor %s on `before`', async (_case, before, code) => {
      expect(await list(await user(), before)).toEqual({
        ok: false,
        error: { code: 'invalid-input', fields: { before: code } },
      });
    });
  });

  it('is empty for a user with nothing to see', async () => {
    expect(await list(await user())).toEqual({ ok: true, value: { items: [], next: null } });
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
  ] as const)('refuses a %s user', async (_, seed) => {
    const gone = await world.seed.user(seed);
    expect(await list(gone)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });
});

describe('future.list report state', () => {
  const stateOf = async (by: UserRecord, id: string) => {
    const result = await list(by);
    return result.ok ? result.value.items.find((row) => row.id === id)?.reportState : undefined;
  };

  it('says where the report of an akce stands, to the author and to any reader', async () => {
    const author = await user();
    const id = await item(author, 'approved');
    const reader = await user();
    expect(await stateOf(author, id)).toBe('none');
    expect(await stateOf(reader, id)).toBe('none');

    await world.tx(world.as(author), async (tx) => {
      const before = (await tx.futureItems.loadForWrite(id))!;
      await tx.futureItems.update(id, before.version, { reportState: 'written' });
      await tx.audit.record({ action: 'future.test', target: { type: 'future_item', id } });
    });
    expect(await stateOf(author, id)).toBe('written');
    expect(await stateOf(reader, id)).toBe('written');
  });
});
