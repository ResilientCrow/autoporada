import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

import type { JobPort, Tx, TxContext } from '@/application/ports';

import { guardClient, guardPort, type TxLife } from './guard';
import { createAccessRequestRepo } from './repos/access-requests';
import { createAuditWriter } from './repos/audit';
import { createDocumentRepo } from './repos/documents';
import { createPointEventRepo } from './repos/events';
import { createFutureEventRepo } from './repos/future-events';
import { createFutureIssueReads } from './repos/future-issue';
import { createFutureReportReads } from './repos/future-reports';
import { createFutureItemRepo } from './repos/future-items';
import { createIssueItemRepo } from './repos/issue-items';
import { createIssueRepo } from './repos/issues';
import { createMailLedgerRepo } from './repos/mail-ledger';
import { createPointIssueReads } from './repos/points-issue';
import { createPointReads } from './repos/points-read';
import { createPointCloseRepo } from './repos/points-close';
import { createPointReportReads } from './repos/points-reports';
import { createPointWrites } from './repos/points-write';
import { createRegistryRepo } from './repos/registry';
import { createReportPlaceholderRepo } from './repos/report-placeholders';
import { createSessionRepo } from './repos/sessions';
import { createSettingsRepo } from './repos/settings';
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
    issueItems: guard(createIssueItemRepo(db, ctx)),
    settings: guard(createSettingsRepo(db, ctx)),
    registry: guard(createRegistryRepo(db, ctx)),
    documents: guard(createDocumentRepo(db, ctx)),
    points: guard({
      ...createPointReads(db, ctx),
      ...createPointIssueReads(db, ctx),
      ...createPointReportReads(db, ctx),
      ...createPointCloseRepo(db, ctx),
      ...createPointWrites(db, ctx),
    }),
    pointEvents: guard(createPointEventRepo(db, ctx)),
    futureItems: guard({
      ...createFutureItemRepo(db, ctx),
      ...createFutureIssueReads(db, ctx),
      ...createFutureReportReads(db, ctx),
    }),
    futureEvents: guard(createFutureEventRepo(db, ctx)),
    reportPlaceholders: guard(createReportPlaceholderRepo(db, ctx)),
    audit: guard(createAuditWriter(db, ctx)),
    jobs: guard(jobsOn(guarded)),
    mailLedger: guard(createMailLedgerRepo(db, ctx)),
  };
}
