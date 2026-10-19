import type { PoolClient } from 'pg';

import { TxClosed } from '@/application/ports';

import { toPortError } from './pg-errors';

/** Whether a transaction is still running; flipped once it commits or rolls back. */
export interface TxLife {
  readonly open: boolean;
}

/**
 * The connection as Drizzle sees it: once the transaction has ended, a
 * leaked promise cannot run a query inside the next transaction that gets
 * this connection.
 */
export function guardClient(client: PoolClient, life: TxLife): PoolClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'query') return Reflect.get(target, property, receiver);
      return (...args: unknown[]): unknown =>
        life.open ? Reflect.apply(target.query, target, args) : Promise.reject(new TxClosed());
    },
  });
}

/**
 * A port as the application sees it: every method refuses to run after the
 * transaction ended, and every error it throws is already a port error, so
 * no SQL or parameter escapes even if application code catches it.
 */
export function guardPort<T extends object>(port: T, life: TxLife): T {
  return new Proxy(port, {
    get(target, property, receiver) {
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]): unknown => {
        if (!life.open) throw new TxClosed();
        const result: unknown = Reflect.apply(member, target, args);
        return result instanceof Promise
          ? result.catch((error: unknown) => {
              throw toPortError(error);
            })
          : result;
      };
    },
  });
}
