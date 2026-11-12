import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';

import { setupWorld } from '../../../../test/support/world';
import { createFuture } from './index';

const world = setupWorld();

const submitter = () => world.seed.user({ role: 'submitter' });
const start = (by: UserRecord, input: Record<string, unknown> = {}) =>
  world.run(createFuture, world.as(by), { clientRef: randomUUID(), kind: 'akce', ...input });

async function created(by: UserRecord, input: Record<string, unknown> = {}): Promise<string> {
  const result = await start(by, input);
  if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
  return result.value.id;
}

const read = (by: UserRecord, id: string) =>
  world.tx(world.as(by), (tx) => tx.futureItems.get(id), 'read');
const everything = () =>
  world.tx(
    system('test.seed'),
    async (tx) => ({ items: await tx.futureItems.list(100), audit: await world.inspect.audit() }),
    'read',
  );

describe('future.create', () => {
  it.each(['akce', 'jednani'] as const)('starts an empty %s draft at version 1', async (kind) => {
    const author = await submitter();
    const id = await created(author, { kind });
    expect(await read(author, id)).toMatchObject({
      id,
      kind,
      authorId: author.id,
      state: 'draft',
      version: 1,
      reportState: 'none',
      submittedAt: null,
      content: {
        title: '',
        startDate: null,
        endDate: null,
        timeFrom: null,
        timeTo: null,
        campus: null,
        place: null,
      },
    });
  });

  it('refuses a kind that is neither jednání nor akce', async () => {
    const author = await submitter();
    const result = await start(author, { kind: 'report' });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect((await everything()).items).toEqual([]);
  });

  it('answers a retry with the same item, unchanged, and audits the create once', async () => {
    const author = await submitter();
    const clientRef = randomUUID();
    const id = await created(author, { clientRef });
    const before = await everything();
    world.clock.advance(60_000);
    expect(await start(author, { clientRef, kind: 'jednani' })).toEqual({
      ok: true,
      value: { id },
    });
    expect(await everything()).toEqual(before);
    expect(before.audit).toHaveLength(1);
  });

  it('never answers with a colleague’s item that has the same ref', async () => {
    const author = await submitter();
    const colleague = await submitter();
    const clientRef = randomUUID();
    const theirs = await created(colleague, { clientRef });
    const mine = await created(author, { clientRef });
    expect(mine).not.toBe(theirs);
    expect(await read(author, mine)).toMatchObject({ authorId: author.id });
  });

  it('makes one item when the same ref arrives twice at once', async () => {
    const author = await submitter();
    const clientRef = randomUUID();
    const results = await Promise.all([start(author, { clientRef }), start(author, { clientRef })]);
    const ids = results.map((r) => (r.ok ? r.value.id : r.error.code));
    expect(new Set(ids).size).toBe(1);
    const { items, audit } = await everything();
    expect(items.map((i) => i.id)).toEqual([ids[0]]);
    expect(audit).toHaveLength(1);
  });

  it.each([
    ['pending', { role: 'pending' }],
    ['deactivated', { role: 'submitter', status: 'deactivated' }],
    ['blocked', { role: 'submitter', status: 'blocked' }],
  ] as const)('refuses a %s user and writes nothing', async (_, seed) => {
    const user = await world.seed.user(seed);
    expect(await start(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await everything()).toEqual({ items: [], audit: [] });
  });

  it.each([
    ['a student submitter', { role: 'submitter', isStudent: true }],
    ['a reviewer', { role: 'reviewer' }],
    ['the headmaster', { role: 'headmaster' }],
  ] as const)('lets %s start one', async (_, seed) => {
    const user = await world.seed.user(seed);
    expect((await start(user)).ok).toBe(true);
  });

  it('cannot run for the system', async () => {
    await expect(
      world.run(createFuture, system('cli:test'), { clientRef: randomUUID(), kind: 'akce' }),
    ).rejects.toThrow('future.create: runs as a signed-in user');
  });

  it('records future.created on the item with its kind, and no content', async () => {
    const author = await submitter();
    const id = await created(author, { kind: 'jednani' });
    expect((await everything()).audit).toEqual([
      {
        actorId: author.id,
        action: 'future.created',
        targetType: 'future_item',
        targetId: id,
        data: {
          diff: { state: { from: null, to: 'draft' }, reportState: { from: null, to: 'none' } },
          meta: { kind: 'jednani' },
        },
        requestId: 'test',
      },
    ]);
  });
});
