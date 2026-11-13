import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { POINT_LIMITS } from '@/domain/report';

import { futureFixtures } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { refuseCancelFuture, requestCancelFuture } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const NOTE = 'Akce se koná, autobus je objednaný.';
const refuse = (by: UserRecord, id: string, over: Record<string, unknown> = {}) =>
  world.run(refuseCancelFuture, world.as(by), { id, expectedVersion: 3, note: NOTE, ...over });

/** An approved akce whose author asked for its cancel (version 3), then a minute passes. */
async function asked(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  await moveTo(author, id, 'approved');
  const result = await world.run(requestCancelFuture, world.as(author), {
    id,
    expectedVersion: 2,
    confirmed: true,
  });
  if (!result.ok) throw new Error(`request refused: ${result.error.code}`);
  world.clock.advance(60_000);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

describe('future.refuseCancel', () => {
  it.each(['reviewer', 'headmaster'] as const)(
    'lets a %s keep the akce: approved, the request cleared, the note in the history only',
    async (role) => {
      const id = await asked(await user());
      const by = await user(role);
      expect(await refuse(by, id, { note: `  ${NOTE}  ` })).toEqual({
        ok: true,
        value: { version: 4 },
      });
      const { item, events, audit } = await snapshot(id);
      expect(item).toMatchObject({ state: 'approved', version: 4, cancelRequestedAt: null });
      expect(events[0]).toMatchObject({
        event: 'refuse-cancel',
        fromState: 'approved',
        toState: 'approved',
        note: NOTE,
        actorId: by.id,
      });
      const last = audit.at(-1);
      expect(last).toMatchObject({
        action: 'future.cancel-refused',
        targetId: id,
        data: {
          diff: { cancelRequestedAt: { from: expect.any(String), to: null } },
          meta: { kind: 'akce' },
        },
      });
      expect(JSON.stringify(last)).not.toContain('autobus');
    },
  );

  it.each([
    ['no note', { note: undefined }],
    ['a blank note', { note: '   ' }],
    ['a note past the limit', { note: 'x'.repeat(POINT_LIMITS.note + 1) }],
  ])('refuses %s', async (_name, over) => {
    const id = await asked(await user());
    const result = await refuse(await user('reviewer'), id, over);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect((await snapshot(id)).item).toMatchObject({ version: 3 });
  });

  it('refuses an approved akce with no request waiting', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await moveTo(author, id, 'approved');
    await refuses(id, async () => refuse(await user('reviewer'), id, { expectedVersion: 2 }), {
      code: 'forbidden',
    });
  });

  it('refuses the author, who takes the request back instead', async () => {
    const author = await user();
    const id = await asked(author);
    await refuses(id, () => refuse(author, id), { code: 'forbidden' });
  });

  it('does not find the akce for a colleague', async () => {
    const id = await asked(await user());
    await refuses(id, async () => refuse(await user(), id), { code: 'not-found' });
  });

  it('answers a stale version with conflict', async () => {
    const id = await asked(await user());
    await refuses(id, async () => refuse(await user('reviewer'), id, { expectedVersion: 2 }), {
      code: 'conflict',
    });
  });
});
