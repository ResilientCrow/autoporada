import { DatabaseFailure, TxClosed } from '@/application/ports';

/** What a guard reads of a FakeTxState (named apart, so state.ts may use `refusedBy` without a cycle). */
interface TxLife {
  readonly mode: 'write' | 'read';
  readonly life: { readonly open: boolean };
}

/** As PostgreSQL: nothing after the transaction ended, no writes in read mode. */
export function guard(tx: TxLife, write: boolean): void {
  if (!tx.life.open) throw new TxClosed();
  if (write && tx.mode === 'read') throw new DatabaseFailure('25006');
}

/** An unregistered constraint, as infra/db/pg-errors.ts reports it. */
export const refusedBy = (constraint: string) => new DatabaseFailure(`db.constraint.${constraint}`);
