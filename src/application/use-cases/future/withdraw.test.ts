import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures, readyAkce } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { decideFuture, saveFuture, submitFuture, withdrawFuture } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const withdraw = (
  by: UserRecord,
  id: string,
  expectedVersion: number,
  extra: Record<string, unknown> = { confirmed: true },
) => world.run(withdrawFuture, world.as(by), { id, expectedVersion, ...extra });

/** An akce of the author's in `state` and its version: submitted through the use case. */
async function itemIn(author: UserRecord, state: FutureState): Promise<[string, number]> {
  const id = await start(author, 'akce');
  if (state === 'draft') return [id, 1];
  const result = await world.run(submitFuture, world.as(author), {
    id,
    expectedVersion: 1,
    content: readyAkce(),
  });
  if (!result.ok) throw new Error(`submit refused: ${result.error.code}`);
  if (state === 'submitted') return [id, 2];
  await moveTo(author, id, state);
  return [id, 3];
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const forbidden = { code: 'forbidden' };

describe('future.withdraw', () => {
  it.each(['draft', 'returned', 'submitted'] as const)(
    'withdraws a %s item and records it',
    async (from) => {
      const author = await user();
      const [id, version] = await itemIn(author, from);
      expect(await withdraw(author, id, version)).toEqual({
        ok: true,
        value: { version: version + 1 },
      });
      const { item, audit, events } = await snapshot(id);
      expect(item).toMatchObject({ state: 'withdrawn', version: version + 1 });
      expect(audit.at(-1)).toMatchObject({
        actorId: author.id,
        action: 'future.withdrawn',
        targetType: 'future_item',
        targetId: id,
        data: { diff: { state: { from, to: 'withdrawn' } }, meta: { kind: 'akce' } },
      });
      expect(events[0]).toMatchObject({ event: 'withdraw', fromState: from, toState: 'withdrawn' });
    },
  );

  it('withdraws a jednání too', async () => {
    const author = await user();
    const id = await start(author, 'jednani');
    expect(await withdraw(author, id, 1)).toEqual({ ok: true, value: { version: 2 } });
  });

  it('withdraws a draft never handed in without a submit time, unseen by reviewers', async () => {
    const author = await user();
    const [id] = await itemIn(author, 'draft');
    await withdraw(author, id, 1);
    expect((await get(author, id))?.submittedAt).toBeNull();
    expect(await get(await user('reviewer'), id)).toBeNull();
  });

  it.each([
    ['unchecked', { confirmed: false }],
    ['missing', {}],
  ])('refuses without the confirmation (%s) and writes nothing', async (_case, extra) => {
    const author = await user();
    const [id] = await itemIn(author, 'submitted');
    await refuses(id, () => withdraw(author, id, 2, extra), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
  });

  it.each(['approved', 'rejected', 'withdrawn', 'cancelled'] as const)(
    'refuses a %s item',
    async (state) => {
      const author = await user();
      const [id, version] = await itemIn(author, state);
      await refuses(id, () => withdraw(author, id, version), forbidden);
    },
  );

  describe('an akce once approved (ADR 0057: cancelled, never withdrawn)', () => {
    /** Submitted by the author and approved by the headmaster through the use cases: version 3. */
    async function approved(author: UserRecord): Promise<string> {
      const [id] = await itemIn(author, 'submitted');
      const done = await world.run(decideFuture, world.as(await user('headmaster')), {
        id,
        expectedVersion: 2,
        event: 'approve',
      });
      if (!done.ok) throw new Error(`approve refused: ${done.error.code}`);
      return id;
    }

    it('refuses it back in review after the author’s change', async () => {
      const author = await user();
      const id = await approved(author);
      const revised = await world.run(saveFuture, world.as(author), {
        id,
        expectedVersion: 3,
        intent: 'revise',
        content: readyAkce({ title: 'Jiný název' }),
      });
      expect(revised).toMatchObject({ ok: true, value: { state: 'submitted' } });
      await refuses(id, () => withdraw(author, id, 4), forbidden);
    });

    it('refuses it returned by a reviewer', async () => {
      const author = await user();
      const id = await approved(author);
      const returned = await world.run(decideFuture, world.as(await user('reviewer')), {
        id,
        expectedVersion: 3,
        event: 'return',
        parts: ['place'],
      });
      expect(returned.ok).toBe(true);
      await refuses(id, () => withdraw(author, id, 4), forbidden);
    });
  });

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const [id] = await itemIn(author, 'submitted');
    await refuses(id, () => withdraw(author, id, 1), { code: 'conflict' });
  });

  it('does not find a submitted item for a reviewer', async () => {
    const author = await user();
    const [id] = await itemIn(author, 'submitted');
    const reviewer = await user('reviewer');
    await refuses(id, () => withdraw(reviewer, id, 2), { code: 'not-found' });
  });

  it('does not find a colleague’s draft', async () => {
    const author = await user();
    const [id] = await itemIn(author, 'draft');
    const headmaster = await user('headmaster');
    await refuses(id, () => withdraw(headmaster, id, 1), { code: 'not-found' });
  });

  it('cannot run for the system', async () => {
    const input = { id: randomUUID(), expectedVersion: 1, confirmed: true };
    await expect(world.run(withdrawFuture, system('cli:test'), input)).rejects.toThrow(
      'future.withdraw: runs as a signed-in user',
    );
  });
});
