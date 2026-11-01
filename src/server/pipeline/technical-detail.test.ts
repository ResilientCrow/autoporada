import { describe, expect, it } from 'vitest';

import { DatabaseFailure, TxClosed } from '@/application/ports';

import { databaseAddress, technicalDetail } from './technical-detail';

const URL_WITH_SECRETS =
  'postgres://app_user:s3cr3t-pass@db.internal:6543/autoporada?sslmode=require';

describe('databaseAddress', () => {
  it('keeps host and port and drops credentials, path and query', () => {
    const address = databaseAddress(URL_WITH_SECRETS);
    expect(address).toBe('db.internal:6543');
    expect(address).not.toContain('s3cr3t');
    expect(address).not.toContain('app_user');
  });

  it('defaults the port', () => {
    expect(databaseAddress('postgresql://u:p@localhost/db')).toBe('localhost:5432');
  });

  it('gives no address for a URL it cannot read, rather than echoing it', () => {
    expect(databaseAddress('postgres://u:p@:::/db')).toBeUndefined();
  });
});

describe('technicalDetail', () => {
  it('is off in production, so nothing technical can be sent', () => {
    expect(technicalDetail('production', 'db.internal:6543')).toBeUndefined();
  });

  it.each(['development', 'test'] as const)('is on in %s', (environment) => {
    expect(technicalDetail(environment, 'localhost:5432')).toBeTypeOf('function');
  });

  const describeError = technicalDetail('development', 'localhost:5432');
  if (!describeError) throw new Error('development describes failures');

  it('names a lost database by its code, address and the command that starts it', () => {
    const detail = describeError(new DatabaseFailure('08000'), 'database-down');
    expect(detail).toContain('DatabaseFailure');
    expect(detail).toContain('08000');
    expect(detail).toContain('localhost:5432');
    expect(detail).toContain('pnpm dev:services');
  });

  it('names the code of other database failures without the address hint', () => {
    const detail = describeError(new DatabaseFailure('42P01'), 'database-setup');
    expect(detail).toContain('42P01');
    expect(detail).not.toContain('pnpm dev:services');
  });

  it('never repeats the message of a raw driver error, which can quote a value', () => {
    const raw = Object.assign(new Error('duplicate key value (Jana Nováková)'), {
      severity: 'ERROR',
      code: '23505',
    });
    const detail = describeError(raw, 'bug');
    expect(detail).toContain('23505');
    expect(detail).not.toContain('Jana');
  });

  it('shows name and message of any other error', () => {
    expect(describeError(new TypeError('x is undefined'), 'bug')).toBe('TypeError: x is undefined');
    expect(describeError(new TxClosed('closed'), 'bug')).toBe('TxClosed: closed');
  });

  it('caps a long message', () => {
    const detail = describeError(new Error('x'.repeat(1000)), 'bug');
    expect(detail?.length).toBeLessThanOrEqual(200);
  });

  it('says only the type of a thrown non-error', () => {
    expect(describeError('boom', 'bug')).toBe('string');
    expect(describeError(undefined, 'bug')).toBe('undefined');
  });

  it('never carries the credentials of the database URL', () => {
    const address = databaseAddress(URL_WITH_SECRETS);
    const describeWith = technicalDetail('development', address);
    const detail = describeWith?.(new DatabaseFailure('08000'), 'database-down') ?? '';
    expect(detail).toContain('db.internal:6543');
    expect(detail).not.toContain('s3cr3t');
    expect(detail).not.toContain('app_user');
  });
});
