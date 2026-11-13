import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { FutureKind } from '@/domain/calendar';

import { futureFixtures, readyAkce } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import {
  decideFuture,
  queueFuture,
  refuseCancelFuture,
  requestCancelFuture,
  saveFuture,
  submitFuture,
} from './index';

const world = setupWorld();
const { start, moveTo } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const queue = async (by: UserRecord) => {
  const result = await world.run(queueFuture, world.as(by), {});
  if (!result.ok) throw new Error(`queue refused: ${result.error.code}`);
  return result.value;
};

/** An item handed in through the use case (version 2), then a minute passes. */
async function submit(author: UserRecord, kind: FutureKind = 'akce', title = 'Výlet do Prahy') {
  const id = await start(author, kind);
  const content = readyAkce({ title });
  const sent = await world.run(submitFuture, world.as(author), { id, expectedVersion: 1, content });
  if (!sent.ok) throw new Error(`submit refused: ${sent.error.code}`);
  world.clock.advance(60_000);
  return id;
}

describe('future.queue', () => {
  it('lists the submitted items, the oldest hand-in first, with what the reviewer needs to pick', async () => {
    const author = await user();
    const first = await submit(author, 'akce', 'První');
    const second = await submit(author, 'jednani', 'Druhá');
    await start(author, 'akce');
    const reviewer = await user('reviewer');
    const { items, more } = await queue(reviewer);
    expect(more).toBe(false);
    expect(items).toEqual([
      {
        id: first,
        kind: 'akce',
        title: 'První',
        startDate: '2026-11-10',
        endDate: null,
        submittedAt: '2026-10-19T08:00:00.000Z',
        cancelRequestedAt: null,
        revised: false,
      },
      expect.objectContaining({ id: second, kind: 'jednani', title: 'Druhá', revised: false }),
    ]);
  });

  it('leaves out what is not waiting: drafts, approved, returned, rejected, cancelled', async () => {
    const author = await user();
    const waiting = await submit(author);
    for (const state of ['approved', 'returned', 'rejected', 'cancelled'] as const) {
      const id = await start(author, 'akce');
      await moveTo(author, id, state);
    }
    expect((await queue(await user('headmaster'))).items.map((i) => i.id)).toEqual([waiting]);
  });

  it('marks an approved akce its author changed „revised“ until it is decided again', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await moveTo(author, id, 'approved');
    world.clock.advance(60_000);
    const revised = await world.run(saveFuture, world.as(author), {
      id,
      expectedVersion: 2,
      intent: 'revise',
      content: readyAkce({ title: 'Jiný název' }),
    });
    expect(revised).toMatchObject({ ok: true, value: { state: 'submitted' } });
    const reviewer = await user('reviewer');
    expect((await queue(reviewer)).items).toEqual([
      expect.objectContaining({ id, title: 'Jiný název', revised: true }),
    ]);
    const returned = await world.run(decideFuture, world.as(reviewer), {
      id,
      expectedVersion: 3,
      event: 'return',
      note: 'Doplňte prosím vyjádření.',
    });
    expect(returned.ok).toBe(true);
    world.clock.advance(60_000);
    const again = await world.run(submitFuture, world.as(author), {
      id,
      expectedVersion: 4,
      content: readyAkce({ title: 'Jiný název' }),
    });
    expect(again.ok).toBe(true);
    expect((await queue(reviewer)).items.map((i) => [i.id, i.revised])).toEqual([[id, false]]);
  });

  it('lists an approved akce whose cancel waits, by when it was asked for, until the vedení decides (ADR 0062)', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await moveTo(author, id, 'approved');
    const waiting = await submit(author);
    world.clock.advance(60_000);
    const asked = await world.run(requestCancelFuture, world.as(author), {
      id,
      expectedVersion: 2,
      confirmed: true,
    });
    expect(asked.ok).toBe(true);
    const reviewer = await user('reviewer');
    const { items } = await queue(reviewer);
    expect(items.map((i) => [i.id, i.cancelRequestedAt])).toEqual([
      [waiting, null],
      [id, world.clock.now().toISOString()],
    ]);
    const refused = await world.run(refuseCancelFuture, world.as(reviewer), {
      id,
      expectedVersion: 3,
      note: 'Akce platí.',
    });
    expect(refused.ok).toBe(true);
    expect((await queue(reviewer)).items.map((i) => i.id)).toEqual([waiting]);
  });

  it.each([
    ['a teacher', { role: 'submitter' }],
    ['a student', { role: 'submitter', isStudent: true }],
    ['a pending user', { role: 'pending' }],
  ] as const)('is not for %s', async (_who, seed) => {
    const who = await world.seed.user(seed);
    const result = await world.run(queueFuture, world.as(who), {});
    expect(result).toMatchObject({
      ok: false,
      error: { code: expect.stringMatching(/forbidden|not-found/) },
    });
  });
});
