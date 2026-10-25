import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

import type { JobPort, Tx, TxContext } from '@/application/ports';

import { guardClient, guardPort, type TxLife } from './guard';
import { createAccessRequestRepo } from './repos/access-requests';
import { createAuditWriter } from './repos/audit';
import { createIssueRepo } from './repos/issues';
import { createMailLedgerRepo } from './repos/mail-ledger';
import { createPointTypeRepo } from './repos/point-types';
import { createSessionRepo } from './repos/sessions';
import { createSignInRepo } from './repos/sign-ins';
import { createUserRepo } from './repos/users';

/**
 * The job queue on a transaction's connection. It is given the guarded client, so a job sent
 * after the transaction ended is refused like any other query; infra/db knows no queue library.
 */
export type JobsOn = (client: Pick<PoolClient, 'query'>) => JobPort;

/** Everything a transaction may touch, on one connection and for one principal. */
export function buildTx(client: PoolClient, ctx: TxContext, life: TxLife, jobsOn: JobsOn): Tx {
  const guarded = guardClient(client, life);
  const db = drizzle({ client: guarded, casing: 'snake_case' });
  const guard = <T extends object>(port: T) => guardPort(port, life);
  return {
    ctx,
    users: guard(createUserRepo(db, ctx)),
    accessRequests: guard(createAccessRequestRepo(db, ctx)),
    signIns: guard(createSignInRepo(db, ctx)),
    sessions: guard(createSessionRepo(db, ctx)),
    issues: guard(createIssueRepo(db, ctx)),
    pointTypes: guard(createPointTypeRepo(db)),
    audit: guard(createAuditWriter(db, ctx)),
    jobs: guard(jobsOn(guarded)),
    mailLedger: guard(createMailLedgerRepo(db, ctx)),
  };
}
