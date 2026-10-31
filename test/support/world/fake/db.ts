import type { Db, Tx, TxContext, TxMode, TxOptions } from '@/application/ports';
import { inTransactionScope } from '@/infra/system';

import { fakeAccessRequestRepo } from './access-requests';
import { fakeAudit, fakeJobs } from './effects';
import { fakeFutureEventRepo } from './future-events';
import { fakeFutureItemRepo } from './future-items';
import { fakeIssueRepo } from './issues';
import { fakeMailLedger } from './mail-ledger';
import { checkAuditCoverage } from './oracle';
import { fakePointEventRepo } from './point-events';
import { fakePointTypeRepo } from './point-types';
import { fakePointRepo } from './points';
import { emptyState, type FakeState, type FakeTxState } from './state';
import { fakeRegistryRepo } from './registry';
import { fakeSessionRepo } from './sessions';
import { fakeSettingsRepo } from './settings';
import { fakeSignInRepo } from './sign-ins';
import { fakeUserRepo } from './users';

export interface FakeDb extends Db {
  /** The committed state. */
  readonly state: () => FakeState;
  /** Every transaction, in order: proves that a refusal opened none. */
  readonly history: { readonly mode: TxMode; readonly outcome: 'commit' | 'rollback' }[];
  /** Makes the next commit fail with `error`, as a database would. */
  failNext(error: Error): void;
}

/**
 * Transactions over an in-memory state. Each one works on a copy that
 * replaces the state on commit; a mutex runs them one at a time, which
 * also stands in for row locks. The repos emulate the triggers whose
 * effects a use case relies on (users_end_sessions, in fake/users.ts).
 */
export function createFakeDb(): FakeDb {
  let state = emptyState();
  let queue: Promise<unknown> = Promise.resolve();
  let injected: Error | undefined;
  const history: FakeDb['history'] = [];

  async function attempt<T>(
    ctx: TxContext,
    options: TxOptions,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const life = { open: true };
    const tx: FakeTxState = {
      draft: structuredClone(state),
      mode: options.mode,
      life,
      written: [],
      exempted: [],
      atCommit: [],
    };
    const auditBefore = tx.draft.audit.length;
    const view: Tx = {
      ctx,
      users: fakeUserRepo(tx, ctx),
      accessRequests: fakeAccessRequestRepo(tx, ctx),
      signIns: fakeSignInRepo(tx, ctx),
      sessions: fakeSessionRepo(tx, ctx),
      issues: fakeIssueRepo(tx, ctx),
      pointTypes: fakePointTypeRepo(tx, ctx),
      settings: fakeSettingsRepo(tx, ctx),
      registry: fakeRegistryRepo(tx, ctx),
      points: fakePointRepo(tx, ctx),
      pointEvents: fakePointEventRepo(tx, ctx),
      futureItems: fakeFutureItemRepo(tx, ctx),
      futureEvents: fakeFutureEventRepo(tx, ctx),
      audit: fakeAudit(tx, ctx),
      jobs: fakeJobs(tx),
      mailLedger: fakeMailLedger(tx, ctx),
    };
    try {
      const value = await inTransactionScope(() => work(view));
      for (const check of tx.atCommit) check();
      if (injected) throw injected;
      const seeding = ctx.principal.kind === 'system' && ctx.principal.reason === 'test.seed';
      if (!seeding) checkAuditCoverage(tx, auditBefore);
      state = tx.draft;
      history.push({ mode: options.mode, outcome: 'commit' });
      return value;
    } catch (error) {
      history.push({ mode: options.mode, outcome: 'rollback' });
      throw error;
    } finally {
      injected = undefined;
      life.open = false;
    }
  }

  return {
    state: () => state,
    history,
    failNext(error) {
      injected = error;
    },
    transaction(ctx, options, work) {
      const run = queue.then(() => attempt(ctx, options, work));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
