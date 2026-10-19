import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import {
  ConstraintViolation,
  DatabaseFailure,
  KNOWN_CONSTRAINTS,
  LockTimeout,
  TransactionConflict,
  type KnownConstraint,
} from '@/application/ports';

/**
 * Database errors leave infra as port errors (ADR 0011). Drizzle's wrapper
 * spells out the failed SQL and its parameters, which hold minors' data, and
 * a PostgreSQL message can quote a value; only the SQLSTATE survives.
 */

const RETRYABLE = new Set(['40001', '40P01']);
const known = (name: unknown): name is KnownConstraint =>
  (KNOWN_CONSTRAINTS as readonly unknown[]).includes(name);

/** The driver error behind Drizzle's wrapper, if `error` came from the database. */
function driverError(error: unknown): unknown {
  return error instanceof DrizzleQueryError ? error.cause : error;
}

/** Serialization failures and deadlocks: the whole transaction may simply run again. */
export function isRetryable(error: unknown): boolean {
  const cause = driverError(error);
  return cause instanceof DatabaseError && RETRYABLE.has(cause.code ?? '');
}

/** A PostgreSQL error as the port error the application understands. */
function fromDatabaseError(error: DatabaseError): Error {
  const code = error.code ?? 'XX000';
  if (code === '55P03') return new LockTimeout();
  if (RETRYABLE.has(code)) return new TransactionConflict();
  if (known(error.constraint)) return new ConstraintViolation(error.constraint);
  return new DatabaseFailure(code);
}

/**
 * Errors thrown while a transaction does its work. Database errors become
 * port errors; anything else (a failure result, a bug) passes unchanged.
 */
export function toPortError(error: unknown): unknown {
  if (error instanceof DatabaseError) return fromDatabaseError(error);
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause;
    return cause instanceof DatabaseError ? fromDatabaseError(cause) : new DatabaseFailure('08000');
  }
  return error;
}

/**
 * Errors of the driver calls infra makes itself (connect, BEGIN, COMMIT).
 * They come from the database by definition: a lost connection is 08000.
 */
export function fromDriver(error: unknown): Error {
  const mapped = toPortError(error);
  // toPortError hands back what it does not recognise; here that is a lost connection.
  return mapped === error || !(mapped instanceof Error) ? new DatabaseFailure('08000') : mapped;
}
