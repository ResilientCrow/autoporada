import type { AccessRequestRepo } from './access-requests';
import type { AuditPort } from './audit';
import type { Clock } from './clock';
import type { JobPort } from './jobs';
import type { Principal } from './principal';
import type { SessionRepo } from './sessions';
import type { SignInRepo } from './sign-ins';
import type { UserRepo } from './users';

export type TxMode = 'write' | 'read';

export interface TxContext {
  readonly principal: Principal;
  /** The instant of the call; repositories write it instead of the database clock. */
  readonly now: Date;
  readonly requestId: string;
}

export interface TxOptions {
  readonly mode: TxMode;
  /** Defaults: statement 5 s, lock 3 s, idle in transaction 15 s. */
  readonly statementTimeoutMs?: number;
  readonly lockTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
}

/** Everything one transaction may touch, bound to its principal and one connection. */
export interface Tx {
  readonly ctx: TxContext;
  readonly users: UserRepo;
  readonly accessRequests: AccessRequestRepo;
  readonly signIns: SignInRepo;
  readonly sessions: SessionRepo;
  readonly audit: AuditPort;
  readonly jobs: JobPort;
}

export interface Db {
  /**
   * Runs `work` in one transaction: commits when it resolves, rolls back when
   * it throws. `read` is REPEATABLE READ READ ONLY. Serialization failures
   * and deadlocks run `work` again, up to three times in all. Errors leave
   * only as the port errors of errors.ts.
   */
  transaction<T>(ctx: TxContext, options: TxOptions, work: (tx: Tx) => Promise<T>): Promise<T>;
}

/** What every use case can rely on. */
export interface AppDeps {
  readonly db: Db;
  readonly clock: Clock;
}
