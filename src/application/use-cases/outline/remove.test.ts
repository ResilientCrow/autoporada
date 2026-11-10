import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SEED_OUTLINE } from '@/domain/outline';

import { monday, outlineFixtures, slotRow, WEEK_1, WEEK_2 } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { dropIssue } from '../issues';
import { removeOutlineItem } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const remove = (by: User, lineageId: string, over: Record<string, unknown> = {}) =>
  world.run(removeOutlineItem, world.as(by), { monday: monday(WEEK_1), lineageId, ...over });

const ids = async (by: User, day = WEEK_1) => {
  const read = await fx.readAs(by, day);
  if (!read.ok) throw new Error('read refused');
  return [...read.value.pokyny, ...read.value.hospodareni].map((r) => r.lineageId);
};
const rule = (code: string) => ({ ok: false, error: { code: 'rule', rule: code } });

describe('outline.remove', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)(
    'refuses a %s and writes nothing',
    async (role) => {
      const user = await world.seed.user({ role });
      expect(await remove(user, randomUUID())).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
      expect(await world.inspect.audit()).toEqual([]);
    },
  );

  it('removes an item that was added and records the section and the rows left', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_1, 'Tajný název');
    expect(await remove(head, id, { expectedVersion: 2 })).toEqual({
      ok: true,
      value: { version: 3, lineageId: id },
    });
    expect(await ids(head)).not.toContain(id);
    const [removed] = await fx.auditOf('outline.removed');
    expect(removed?.data).toEqual({
      meta: {
        monday: monday(WEEK_1),
        lineageId: id,
        section: 'pokyny',
        rows: SEED_OUTLINE.pokyny.length,
      },
    });
    expect(JSON.stringify(await world.inspect.audit())).not.toMatch(/Tajný/);
  });

  it('removes a standing item the seed brought, and the next porada does not bring it back', async () => {
    const head = await fx.headmaster();
    const plain = SEED_OUTLINE.pokyny.find((r) => r.slot === null)!;
    expect((await remove(head, plain.lineageId)).ok).toBe(true);
    expect(await ids(head)).not.toContain(plain.lineageId);
    await fx.addItem(head, WEEK_2, 'Další', { expectedVersion: undefined });
    expect(await ids(head, WEEK_2)).not.toContain(plain.lineageId);
  });

  it('refuses a slot the document makes itself as slot-fixed, and changes nothing', async () => {
    const head = await fx.headmaster();
    expect(await remove(head, slotRow('partners').lineageId)).toEqual(rule('slot-fixed'));
    expect(await fx.issueOf(WEEK_1)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a proposal as proposal-fixed', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal();
    const before = await world.inspect.audit();
    expect(await remove(head, pointId)).toEqual(rule('proposal-fixed'));
    expect(await world.inspect.audit()).toEqual(before);
  });

  it('refuses an unknown item as item-missing', async () => {
    const head = await fx.headmaster();
    expect(await remove(head, randomUUID())).toEqual(rule('item-missing'));
    const id = await fx.addItem(head, WEEK_1, 'Pokyn');
    expect(await remove(head, id, { expectedVersion: 2 })).toMatchObject({ ok: true });
    expect(await remove(head, id, { expectedVersion: 3 })).toEqual(rule('item-missing'));
  });

  it('refuses a stale expectedVersion as a conflict and changes nothing', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_1, 'Pokyn');
    const before = [await fx.issueOf(WEEK_1), await world.inspect.audit(), await ids(head)];
    expect(await remove(head, id, { expectedVersion: 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect([await fx.issueOf(WEEK_1), await world.inspect.audit(), await ids(head)]).toEqual(
      before,
    );
  });

  it('refuses a dropped porada as outside the calendar', async () => {
    const head = await fx.headmaster();
    const id = await fx.addItem(head, WEEK_2, 'Pokyn');
    await world.run(dropIssue, world.as(head), {
      monday: monday(WEEK_2),
      confirmed: true,
      expectedVersion: 2,
    });
    expect(await remove(head, id, { monday: monday(WEEK_2), expectedVersion: 3 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
