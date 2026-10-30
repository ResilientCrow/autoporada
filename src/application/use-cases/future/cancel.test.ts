import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import { futureFixtures } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { cancelFuture, listFuture } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const cancel = (by: UserRecord, id: string, over: Record<string, unknown> = {}) =>
  world.run(cancelFuture, world.as(by), { id, expectedVersion: 2, confirmed: true, ...over });

/** An approved akce of the author's (version 2). */
async function approved(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  await moveTo(author, id, 'approved');
  world.clock.advance(60_000);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const listed = async (by: UserRecord) => {
  const result = await world.run(listFuture, world.as(by), {});
  if (!result.ok) throw new Error('list refused');
  return result.value.items.map((i) => [i.id, i.state]);
};

describe('future.cancel', () => {
  it('lets the author cancel an approved akce, with the states in the audit only', async () => {
    const author = await user();
    const id = await approved(author);
    expect(await cancel(author, id)).toEqual({ ok: true, value: { version: 3 } });
    const { item, events, audit } = await snapshot(id);
    expect(item).toMatchObject({ state: 'cancelled', version: 3 });
    expect(events[0]).toMatchObject({
      event: 'cancel',
      fromState: 'approved',
      toState: 'cancelled',
      note: null,
      actorId: author.id,
    });
    expect(audit.at(-1)).toMatchObject({
      action: 'future.cancelled',
      targetType: 'future_item',
      targetId: id,
      data: { diff: { state: { from: 'approved', to: 'cancelled' } }, meta: { kind: 'akce' } },
    });
  });

  it.each(['reviewer', 'headmaster'] as const)(
    'lets a %s cancel a colleague’s approved akce',
    async (role) => {
      const id = await approved(await user());
      const reviewer = await user(role);
      expect(await cancel(reviewer, id)).toEqual({ ok: true, value: { version: 3 } });
      expect((await snapshot(id)).events[0]).toMatchObject({
        event: 'cancel',
        actorId: reviewer.id,
      });
    },
  );

  it('needs the checkbox ticked', async () => {
    const author = await user();
    const id = await approved(author);
    await refuses(id, () => cancel(author, id, { confirmed: false }), {
      code: 'invalid-input',
      fields: { confirmed: 'required' },
    });
  });

  it.each(['draft', 'submitted', 'returned', 'rejected', 'withdrawn', 'cancelled'] as const)(
    'refuses an item that is %s',
    async (state: FutureState) => {
      const author = await user();
      const id = await start(author, 'akce');
      await moveTo(author, id, state);
      const reviewer = await user('reviewer');
      // A draft is not the reviewers' to see: they find nothing, the author is refused.
      await refuses(id, () => cancel(author, id), { code: 'forbidden' });
      if (state !== 'draft') await refuses(id, () => cancel(reviewer, id), { code: 'forbidden' });
    },
  );

  it.each([
    ['a colleague', { role: 'submitter' }],
    ['a student', { role: 'submitter', isStudent: true }],
  ] as const)('does not find the akce for %s, who may read it', async (_who, seed) => {
    const id = await approved(await user());
    const who = await world.seed.user(seed);
    await refuses(id, () => cancel(who, id), { code: 'not-found' });
  });

  it('answers a stale version with conflict', async () => {
    const author = await user();
    const id = await approved(author);
    await refuses(id, () => cancel(author, id, { expectedVersion: 1 }), { code: 'conflict' });
  });

  describe('afterwards', () => {
    it('only the author and reviewers see the cancelled akce', async () => {
      const author = await user();
      const id = await approved(author);
      const colleague = await user();
      const student = await world.seed.user({ role: 'submitter', isStudent: true });
      const reviewer = await user('reviewer');
      expect((await listed(colleague)).map(([i]) => i)).toContain(id);
      await cancel(reviewer, id);
      expect(await listed(author)).toContainEqual([id, 'cancelled']);
      expect(await listed(reviewer)).toContainEqual([id, 'cancelled']);
      for (const reader of [colleague, student]) {
        expect((await listed(reader)).map(([i]) => i)).not.toContain(id);
        expect(await get(reader, id)).toBeNull();
      }
    });
  });
});
