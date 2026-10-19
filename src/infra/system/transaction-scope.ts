import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<true>();

/** Runs a transaction's work marked as such; the Db implementations call it (ADR 0011). */
export function inTransactionScope<T>(work: () => Promise<T>): Promise<T> {
  return scope.run(true, work);
}

/** Whether the caller runs inside a database transaction's work. */
export function insideTransaction(): boolean {
  return scope.getStore() === true;
}

/**
 * External calls (Entra, Graph, mail) never run inside a transaction: a slow
 * answer would hold locks, and a retry would repeat the call. Adapters call
 * this first.
 */
export function assertOutsideTransaction(what: string): void {
  if (insideTransaction()) throw new Error(`${what} must not run inside a database transaction`);
}
