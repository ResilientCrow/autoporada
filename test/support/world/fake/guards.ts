import { DatabaseFailure, TxClosed } from '@/application/ports';

import type { FakeTxState } from './state';

/** As PostgreSQL: nothing after the transaction ended, no writes in read mode. */
export function guard(tx: FakeTxState, write: boolean): void {
  if (!tx.life.open) throw new TxClosed();
  if (write && tx.mode === 'read') throw new DatabaseFailure('25006');
}
