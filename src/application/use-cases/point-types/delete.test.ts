import { describe, expect, it } from 'vitest';

import { system, type PointTypeRecord, type UserRecord } from '@/application/ports';
import { emptyRichDoc } from '@/domain/richtext';

import { setupWorld } from '../../../../test/support/world';
import { deletePointType } from './index';

const world = setupWorld();
const seeder = system('test.seed');

const headmaster = () => world.seed.user({ role: 'headmaster' });
const remove = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(deletePointType, world.as(by), input);
const of = (type: PointTypeRecord) => ({ id: type.id, expectedVersion: type.version });

/** Every type and the audit log, as the system sees them. */
const snapshot = () =>
  world.tx(
    seeder,
    async (tx) => ({ types: await tx.pointTypes.list(), audit: await world.inspect.audit() }),
    'read',
  );

/** Expects `run` to fail with `error` and to change nothing. */
async function refuses(run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot();
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot()).toEqual(before);
}

/** A draft report of `type` by a new author. */
async function reportOf(type: PointTypeRecord) {
  const author = await world.seed.user({ role: 'submitter' });
  await world.tx(world.as(author), async (tx) => {
    const { point } = await tx.points.create({
      clientRef: crypto.randomUUID(),
      kind: 'report',
      typeId: type.id,
      content: {
        title: '',
        eventDate: null,
        endDate: null,
        timeFrom: null,
        timeTo: null,
        campus: null,
        place: null,
        opening: '',
        openingEdited: false,
        body: emptyRichDoc(),
        bullets: [],
        statements: [],
      },
    });
    await tx.audit.record({ action: 'point.created', target: { type: 'point', id: point.id } });
  });
}

describe('pointTypes.delete', () => {
  it('removes a type no report uses and audits it without its name', async () => {
    const head = await headmaster();
    const kept = await world.seed.pointType({ name: 'Seminář', position: 1 });
    const gone = await world.seed.pointType({ name: 'Beseda', position: 2, titleGender: 'f' });
    expect(await remove(head, of(gone))).toEqual({ ok: true, value: { id: gone.id } });
    const after = await snapshot();
    expect(after.types).toEqual([kept]);
    expect(after.audit.at(-1)).toMatchObject({
      action: 'point_type.deleted',
      actorId: head.id,
      targetType: 'point_type',
      targetId: gone.id,
    });
    expect(JSON.stringify(after.audit)).not.toContain('Beseda');
  });

  it('refuses a type a report uses: it can only be switched off', async () => {
    const head = await headmaster();
    const used = await world.seed.pointType({ name: 'Exkurze', position: 1 });
    await reportOf(used);
    await refuses(() => remove(head, of(used)), { code: 'rule', rule: 'type-in-use' });
  });

  it('never removes the locked „Jiné“', async () => {
    const head = await headmaster();
    const other = await world.seed.pointType({ name: 'Jiné', position: 9, locked: true });
    await refuses(() => remove(head, of(other)), { code: 'rule', rule: 'type-locked' });
  });

  it('answers a conflict for a stale version and not-found for an unknown id', async () => {
    const head = await headmaster();
    const type = await world.seed.pointType({ name: 'Beseda', position: 1 });
    await refuses(() => remove(head, { id: type.id, expectedVersion: 2 }), { code: 'conflict' });
    await refuses(
      () => remove(head, { id: '00000000-0000-7000-8000-999999999999', expectedVersion: 1 }),
      { code: 'not-found' },
    );
  });

  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    const type = await world.seed.pointType({ name: 'Beseda', position: 1 });
    await refuses(() => remove(user, of(type)), { code: 'forbidden' });
  });
});
