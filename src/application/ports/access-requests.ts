import type { AccessState } from '@/domain/review';

export interface AccessRequestRecord {
  readonly id: string;
  readonly userId: string;
  readonly reason: string;
  readonly state: AccessState;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
}

/** Access requests, as the transaction's principal may see them (scope `accessRequest`). */
export interface AccessRequestRepo {
  get(id: string): Promise<AccessRequestRecord | null>;
  /** FOR UPDATE; write transactions only. */
  lock(id: string): Promise<AccessRequestRecord | null>;
  /** Newest first (created_at desc, then id desc). */
  forUser(userId: string): Promise<readonly AccessRequestRecord[]>;
  /**
   * How many requests are still pending that were filed after `since`: what the headmaster's
   * digest counts. System principals only (ScopeViolation for a user, a headmaster too).
   */
  countPendingSince(since: Date): Promise<number>;
  /**
   * ScopeViolation unless the principal is a user who may `access.request`
   * and `userId` is theirs. `created_at` is the transaction's instant.
   */
  create(userId: string, reason: string): Promise<AccessRequestRecord>;
  /**
   * Version-checked (StaleVersion). `cancelled` needs `access.request` and
   * the row's own user, and leaves `decided_by` empty; the other states need
   * `access.decide` and record who decided, so they are always a user's: a
   * system principal gets ScopeViolation. `decided_at` is the transaction's
   * instant and the version rises by one.
   */
  transition(
    id: string,
    expectedVersion: number,
    to: Exclude<AccessState, 'pending'>,
  ): Promise<AccessRequestRecord>;
}
