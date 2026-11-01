import { describe, expect, it } from 'vitest';

import type { FailureCause } from '@/contracts';

import { DatabaseFailure, LockTimeout, TransactionConflict, TxClosed } from '../ports';
import { classifyFailure } from './classify-failure';

/** What the pg driver throws before infra maps it: an Error with `severity` and a 5-character `code`. */
function driverError(code: string): Error {
  return Object.assign(new Error('boom: select * from users where name = $1'), {
    severity: 'ERROR',
    code,
  });
}

const sqlstate = (code: string) => new DatabaseFailure(code);

const ROWS: readonly (readonly [string, unknown, FailureCause])[] = [
  ['connection exception 08000', sqlstate('08000'), 'database-down'],
  ['connection failure 08006', sqlstate('08006'), 'database-down'],
  ['admin shutdown 57P01', sqlstate('57P01'), 'database-down'],
  ['crash shutdown 57P02', sqlstate('57P02'), 'database-down'],
  ['cannot connect now 57P03', sqlstate('57P03'), 'database-down'],
  ['too many connections 53300', sqlstate('53300'), 'database-down'],
  ['out of memory 53200', sqlstate('53200'), 'database-down'],
  ['statement timeout 57014', sqlstate('57014'), 'timeout'],
  ['a lock not granted in time', new LockTimeout(), 'timeout'],
  ['a conflict that outlasted the retries', new TransactionConflict(), 'bug'],
  ['undefined table 42P01', sqlstate('42P01'), 'database-setup'],
  ['undefined column 42703', sqlstate('42703'), 'database-setup'],
  ['undefined function 42883', sqlstate('42883'), 'database-setup'],
  ['insufficient privilege 42501', sqlstate('42501'), 'database-setup'],
  ['invalid authorization 28000', sqlstate('28000'), 'database-setup'],
  ['invalid password 28P01', sqlstate('28P01'), 'database-setup'],
  ['invalid catalog name 3D000', sqlstate('3D000'), 'database-setup'],
  ['stored row of a table', sqlstate('db.parse.points'), 'stored-data'],
  ['stored setting', sqlstate('settings.invalid.deadline'), 'stored-data'],
  ['unregistered constraint', sqlstate('db.constraint.points_check'), 'bug'],
  ['aborted transaction 25P02', sqlstate('25P02'), 'bug'],
  ['internal error XX000', sqlstate('XX000'), 'bug'],
  ['syntax error 42601', sqlstate('42601'), 'bug'],
  ['a used-after-commit repository', new TxClosed(), 'bug'],
  ['a plain Error', new Error('boom'), 'bug'],
  ['a TypeError', new TypeError('x is undefined'), 'bug'],
  ['a string', 'boom', 'bug'],
  ['undefined', undefined, 'bug'],
  ['null', null, 'bug'],
  ['a raw driver connection error', driverError('08006'), 'database-down'],
  ['a raw driver timeout', driverError('57014'), 'timeout'],
  ['a raw driver missing table', driverError('42P01'), 'database-setup'],
  ['a raw driver unknown code', driverError('23505'), 'bug'],
  [
    'an Error with severity but no code',
    Object.assign(new Error('x'), { severity: 'ERROR' }),
    'bug',
  ],
  [
    'an Error with a code of the wrong length',
    Object.assign(new Error('x'), { severity: 'ERROR', code: '57014x' }),
    'bug',
  ],
  [
    'an Error with a numeric code',
    Object.assign(new Error('x'), { severity: 'ERROR', code: 57014 }),
    'bug',
  ],
  [
    'an Error with a 5-character code but no driver shape',
    Object.assign(new Error('x'), { code: '57014' }),
    'bug',
  ],
];

describe('classifyFailure', () => {
  it.each(ROWS)('%s', (_name, error, cause) => {
    expect(classifyFailure(error)).toBe(cause);
  });
});
