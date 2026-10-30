import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { FutureContent, UserRecord } from '@/application/ports';
import { FUTURE_LIST_PAGE } from '@/contracts';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce, readyJednani, staffer } from '../../../../test/support/future';
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
  responsible: null,
  expectsReport: false,
};
const { start, moveTo } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const list = (by: UserRecord) => world.run(listFuture, world.as(by), {});

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

  it('names who is responsible and shows no affiliation or salutation', async () => {
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
            responsible: { verb: 'zajišťuje', behalfOf: '2.A', names: ['Jan Novák'] },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain(staffer.salutation);
  });

  it('answers one page and says there is more when the next page has an item', async () => {
    const author = await user();
    const make = (count: number) =>
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
    await make(FUTURE_LIST_PAGE);
    expect(await list(author)).toMatchObject({ ok: true, value: { more: false } });
    await make(1);
    const result = await list(author);
    expect(result.ok && result.value.items).toHaveLength(FUTURE_LIST_PAGE);
    expect(result.ok && result.value.more).toBe(true);
  });

  it('is empty for a user with nothing to see', async () => {
    expect(await list(await user())).toEqual({ ok: true, value: { items: [], more: false } });
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
  ] as const)('refuses a %s user', async (_, seed) => {
    const gone = await world.seed.user(seed);
    expect(await list(gone)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });
});
