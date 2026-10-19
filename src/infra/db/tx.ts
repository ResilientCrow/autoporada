import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

import type { Tx, TxContext } from '@/application/ports';

import { guardClient, guardPort, type TxLife } from './guard';
import { createAuditWriter } from './repos/audit';
import { unwiredJobs } from './repos/jobs-unwired';
import { createSignInRepo } from './repos/sign-ins';
import { createUserRepo } from './repos/users';

/** Everything a transaction may touch, on one connection and for one principal. */
export function buildTx(client: PoolClient, ctx: TxContext, life: TxLife): Tx {
  const db = drizzle({ client: guardClient(client, life), casing: 'snake_case' });
  const guard = <T extends object>(port: T) => guardPort(port, life);
  return {
    ctx,
    users: guard(createUserRepo(db, ctx)),
    signIns: guard(createSignInRepo(db, ctx)),
    audit: guard(createAuditWriter(db, ctx)),
    jobs: guard(unwiredJobs),
  };
}
