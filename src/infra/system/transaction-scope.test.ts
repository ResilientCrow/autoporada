import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';

import { setupWorld } from '../../../test/support/world';
import { assertOutsideTransaction, inTransactionScope, insideTransaction } from './index';

const world = setupWorld();

describe('transaction scope', () => {
  it('marks the work of a transaction, and nothing around it', async () => {
    expect(insideTransaction()).toBe(false);
    const seen = await inTransactionScope(async () => {
      await Promise.resolve();
      return [insideTransaction(), await inTransactionScope(async () => insideTransaction())];
    });
    expect(seen).toEqual([true, true]);
    expect(insideTransaction()).toBe(false);
  });

  it('is set by the Db for every transaction', async () => {
    const inside = await world.tx(system('cli:test'), async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return insideTransaction();
    });
    expect(inside).toBe(true);
    expect(insideTransaction()).toBe(false);
  });

  it('refuses external calls inside a transaction', async () => {
    expect(() => assertOutsideTransaction('Entra discovery')).not.toThrow();
    await expect(
      world.tx(system('cli:test'), async () => assertOutsideTransaction('Entra discovery')),
    ).rejects.toThrow('Entra discovery must not run inside a database transaction');
  });
});
