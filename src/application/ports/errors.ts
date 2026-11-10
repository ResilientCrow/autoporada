/**
 * The only errors a Db or a repository throws. Infra maps every driver error
 * to one of these; none carries SQL, parameters or a database message.
 */

/** Constraints a race can trip at commit; the runner maps each to a rule. */
export const KNOWN_CONSTRAINTS = [
  'users_active_headmaster',
  'users_student_role',
  'access_requests_one_pending',
  'point_types_name_key',
  'points_type_id_point_types_id_fk',
  'registry_entries_active_key',
  'registry_lists_title_key',
  'registry_lists_key_key',
] as const;
export type KnownConstraint = (typeof KNOWN_CONSTRAINTS)[number];

/** A versioned update matched no row: someone else changed it first. */
export class StaleVersion extends Error {
  override readonly name = 'StaleVersion';
}

/** Serialization failure or deadlock that persisted through the retries. */
export class TransactionConflict extends Error {
  override readonly name = 'TransactionConflict';
}

/** A lock was not granted in time: someone else is working on the same rows. */
export class LockTimeout extends Error {
  override readonly name = 'LockTimeout';
}

/** A known constraint refused the change, possibly at commit. */
export class ConstraintViolation extends Error {
  override readonly name = 'ConstraintViolation';
  constructor(readonly constraint: KnownConstraint) {
    super(constraint);
  }
}

/** A repository was asked for something its principal may not do: a bug. */
export class ScopeViolation extends Error {
  override readonly name = 'ScopeViolation';
}

/** A repository was used after its transaction ended: a bug. */
export class TxClosed extends Error {
  override readonly name = 'TxClosed';
}

/**
 * Any other database failure, by a code only: the SQLSTATE, or a schema
 * identifier such as `db.constraint.<name>` for an unregistered constraint
 * (ADR 0022). Never the SQL, its parameters or the message.
 */
export class DatabaseFailure extends Error {
  override readonly name = 'DatabaseFailure';
  constructor(readonly sqlstate: string) {
    super(`database error ${sqlstate}`);
  }
}
