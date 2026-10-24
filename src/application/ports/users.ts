import type { Role, UserStatus } from '@/domain/actor';

export interface UserRecord {
  readonly id: string;
  readonly tid: string;
  readonly oid: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly role: Role;
  readonly isStudent: boolean;
  readonly status: UserStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Claims of an ID token that infra has verified; never client input. */
export interface VerifiedIdentity {
  readonly tid: string;
  readonly oid: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
}

export interface AccessPatch {
  readonly role?: Role;
  readonly isStudent?: boolean;
  readonly status?: UserStatus;
}

/** Users, as the transaction's principal may see them (scope `user`). */
export interface UserRepo {
  get(id: string): Promise<UserRecord | null>;
  /** FOR UPDATE; write transactions only. */
  lock(id: string): Promise<UserRecord | null>;
  /** The users among `ids` that the principal may see, ordered by id; none for no ids. */
  getMany(ids: readonly string[]): Promise<readonly UserRecord[]>;
  list(filter?: {
    readonly role?: Role;
    readonly status?: UserStatus;
  }): Promise<readonly UserRecord[]>;
  /**
   * Creates the user on first sign-in, or refreshes their display fields.
   * Never changes role, status or the student flag. System principals only.
   */
  upsertFromClaims(identity: VerifiedIdentity): Promise<UserRecord>;
  /**
   * Changes role, status or the student flag; throws StaleVersion.
   * A user principal needs `users.manage` and never changes their own row
   * (ScopeViolation). Approving an access request counts as user management:
   * the step-up lives on the use case's declared check, and a policy test
   * keeps `access.decide` equal to `users.manage`. System principals
   * (`test.seed`, `cli:*`) are not affected.
   */
  changeAccess(id: string, expectedVersion: number, patch: AccessPatch): Promise<UserRecord>;
  countActiveHeadmasters(): Promise<number>;
}
