import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  ConstraintViolation,
  DatabaseFailure,
  LockTimeout,
  StaleVersion,
  TransactionConflict,
} from '@/application/ports';

import { fromDriver, isRetryable, toPortError } from './pg-errors';

const pgError = (code: string, constraint?: string) =>
  Object.assign(new DatabaseError('duplicate key value (oid)=(Jana Nováková)', 0, 'error'), {
    code,
    constraint,
  });
const wrapped = (cause: unknown) =>
  new DrizzleQueryError('insert into "users" … values ($1)', ['Jana Nováková'], cause as Error);

describe('toPortError', () => {
  it.each([
    ['55P03', LockTimeout],
    ['40001', TransactionConflict],
    ['40P01', TransactionConflict],
    ['23505', DatabaseFailure],
  ])('maps SQLSTATE %s', (code, type) => {
    expect(toPortError(pgError(code))).toBeInstanceOf(type);
    expect(toPortError(wrapped(pgError(code)))).toBeInstanceOf(type);
  });

  it('names known constraints, including deferred triggers at COMMIT', () => {
    const mapped = toPortError(pgError('23514', 'users_active_headmaster'));
    expect(mapped).toEqual(new ConstraintViolation('users_active_headmaster'));
    expect(toPortError(pgError('23514', 'users_student_role'))).toEqual(
      new ConstraintViolation('users_student_role'),
    );
    expect(toPortError(pgError('23505', 'access_requests_one_pending'))).toEqual(
      new ConstraintViolation('access_requests_one_pending'),
    );
    expect(toPortError(pgError('23514', 'users_other_check'))).toEqual(
      new DatabaseFailure('23514'),
    );
  });

  it('keeps nothing of the query, its parameters or the message', () => {
    const mapped = toPortError(wrapped(pgError('23505')));
    // The stack is left out: it holds file paths and repeats the message.
    const keys = Object.getOwnPropertyNames(mapped).filter((k) => k !== 'stack');
    const everything = JSON.stringify(mapped, keys);
    expect(everything).not.toMatch(/Jana|insert|users|oid/);
    expect(mapped).toMatchObject({ name: 'DatabaseFailure', sqlstate: '23505' });
  });

  it('lets application errors through unchanged', () => {
    const own = new StaleVersion();
    const bug = new TypeError('x is undefined');
    expect(toPortError(own)).toBe(own);
    expect(toPortError(bug)).toBe(bug);
  });

  it('treats a lost connection as a database failure', () => {
    expect(toPortError(wrapped(new Error('Connection terminated')))).toEqual(
      new DatabaseFailure('08000'),
    );
    expect(fromDriver(new Error('Connection terminated'))).toEqual(new DatabaseFailure('08000'));
  });
});

describe('isRetryable', () => {
  it('retries serialization failures and deadlocks only', () => {
    expect(isRetryable(pgError('40001'))).toBe(true);
    expect(isRetryable(wrapped(pgError('40P01')))).toBe(true);
    expect(isRetryable(pgError('55P03'))).toBe(false);
    expect(isRetryable(new Error('40001'))).toBe(false);
    expect(isRetryable(new TransactionConflict())).toBe(true);
  });
});
