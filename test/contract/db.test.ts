import { describe, expect, inject, it } from 'vitest';

import { DatabaseFailure, system, TxClosed, type Tx } from '@/application/ports';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { setupWorld, TEST_TID } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');
const claims = (oid: string) => ({
  tid: TEST_TID,
  oid,
  displayName: 'Jana Nováková',
  email: null,
  jobTitle: null,
  department: null,
});

describe('Db (port contract)', () => {
  it('rolls back audit events and jobs together with the rest', async () => {
    const user = await world.seed.user();
    const failing = world.tx(cli, async (tx) => {
      await tx.audit.record({ action: 'test.rollback', target: { type: 'user', id: user.id } });
      if (world.supports.jobs) {
        await tx.jobs.enqueue('pdf.render', { documentId: user.id });
      }
      throw new Error('work failed');
    });
    await expect(failing).rejects.toThrow('work failed');
    expect(await world.inspect.audit()).toEqual([]);
    expect(await world.inspect.jobs()).toEqual([]);
  });

  it('refuses writes and row locks in read mode', async () => {
    const user = await world.seed.user();
    const read = <T>(work: (tx: Tx) => Promise<T>) => world.tx(cli, work, 'read');
    await expect(read((tx) => tx.users.lock(user.id))).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
    await expect(
      read((tx) => tx.users.upsertFromClaims(claims('00000000-0000-4000-8000-000000000009'))),
    ).rejects.toEqual(new DatabaseFailure('25006'));
  });

  it('refuses a transaction’s ports once it has ended', async () => {
    let leaked: Tx | undefined;
    await world.tx(cli, async (tx) => {
      leaked = tx;
    });
    await expect(async () => leaked!.users.list()).rejects.toBeInstanceOf(TxClosed);
  });
});

describe.runIf(inject('world') === 'fake')('audit coverage in the fake world', () => {
  it('fails a commit that wrote a row no audit event names', async () => {
    const user = await world.seed.user();
    const unaudited = world.tx(cli, (tx) =>
      tx.users.changeAccess(user.id, 1, { role: 'submitter' }),
    );
    await expect(unaudited).rejects.toBeInstanceOf(UnauditedWrite);
    expect(world.fake?.history.at(-1)).toEqual({ mode: 'write', outcome: 'rollback' });
  });

  it('accepts a write named by an event, as target or related row, or exempted', async () => {
    const [a, b, c] = [await world.seed.user(), await world.seed.user(), await world.seed.user()];
    await world.tx(cli, async (tx) => {
      for (const user of [a!, b!, c!])
        await tx.users.changeAccess(user.id, 1, { status: 'blocked' });
      await tx.audit.record({
        action: 'test.block',
        target: { type: 'user', id: a!.id },
        related: [{ type: 'user', id: b!.id }],
      });
      tx.audit.exempt('retention', { type: 'user', id: c!.id });
    });
  });
});
