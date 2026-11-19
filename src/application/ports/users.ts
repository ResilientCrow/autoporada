import type { Role, Tier, UserFunction, UserStatus } from '@/domain/actor';
import type { Salutation } from '@/domain/cs';

export interface UserRecord {
  readonly id: string;
  readonly tid: string;
  readonly oid: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly role: Role;
  /** Who they are at the school (ADR 0072); a student or absolvent tier limits access. */
  readonly tier: Tier | null;
  /** How documents address them (ADR 0072 item 6): their own answer, null until given. */
  readonly salutation: Salutation | null;
  /** Degrees as they typed them: before the name („Mgr.“) and after it („Ph.D.“). */
  readonly titlesBefore: string | null;
  readonly titlesAfter: string | null;
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
  readonly tier?: Tier | null;
  readonly status?: UserStatus;
}

/** A person's own answer to how documents address them; all three fields are written together. */
export interface AddressPatch {
  readonly salutation: Salutation | null;
  readonly titlesBefore: string | null;
  readonly titlesAfter: string | null;
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
   * Never changes role, status, the tier or the address. System principals only.
   */
  upsertFromClaims(identity: VerifiedIdentity): Promise<UserRecord>;
  /**
   * Changes role, status or the tier; throws StaleVersion. Sessions end when
   * the role, the status or whether the tier is a student one changes.
   * A user principal needs `users.manage` and never changes their own row
   * (ScopeViolation). Approving an access request counts as user management:
   * the step-up lives on the use case's declared check, and a policy test
   * keeps `access.decide` equal to `users.manage`. System principals
   * (`test.seed`, `cli:*`) are not affected.
   */
  changeAccess(id: string, expectedVersion: number, patch: AccessPatch): Promise<UserRecord>;
  /**
   * Writes the salutation and the degrees of the row `id`. Not access: the version stays and no
   * session ends. A user principal writes only their own row (`profile.manage`, else
   * ScopeViolation); of the system only `test.seed` does. ScopeViolation too for a row the
   * principal does not see.
   */
  setAddress(id: string, patch: AddressPatch): Promise<UserRecord>;
  /**
   * The functions of these users, each list in the order it was set; a user with none is absent.
   * Only users the principal may see.
   */
  functions(ids: readonly string[]): Promise<ReadonlyMap<string, readonly UserFunction[]>>;
  /**
   * Replaces the whole list of functions of the row `id` and bumps its version; throws
   * StaleVersion. A user principal needs `users.manage`, on their own row too: a function grants
   * no rights (ADR 0072 item 1). Not access: no session ends.
   */
  setFunctions(
    id: string,
    expectedVersion: number,
    list: readonly UserFunction[],
  ): Promise<UserRecord>;
  countActiveHeadmasters(): Promise<number>;
}
