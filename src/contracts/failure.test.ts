import { describe, expect, it } from 'vitest';

import { causeFromDigest, causeOfError, FAILURE_CAUSES, failureDigest } from './failure';

describe('failure digests', () => {
  it('round-trips every cause', () => {
    for (const cause of FAILURE_CAUSES) {
      expect(causeFromDigest(failureDigest(cause))).toBe(cause);
    }
  });

  it('lists each cause once', () => {
    expect([...FAILURE_CAUSES].sort()).toEqual([
      'bug',
      'database-down',
      'database-setup',
      'stored-data',
      'timeout',
    ]);
  });

  it.each([
    undefined,
    '',
    '1234567890',
    'autoporada:',
    'autoporada:nonsense',
    'autoporada:database-down:extra',
    'AUTOPORADA:database-down',
    ' autoporada:database-down',
  ])('reads %j as a bug', (digest) => {
    expect(causeFromDigest(digest)).toBe('bug');
  });
});

describe('causeOfError', () => {
  it('reads the cause from an error’s digest', () => {
    const error = Object.assign(new Error('x'), { digest: failureDigest('timeout') });
    expect(causeOfError(error)).toBe('timeout');
  });

  it.each([
    ['an error without a digest', new Error('x')],
    ['an error with a digest of Next’s own', Object.assign(new Error('x'), { digest: '123' })],
    ['an error with a digest that is no string', Object.assign(new Error('x'), { digest: 5 })],
    ['a plain object that looks like ours', { digest: failureDigest('timeout') }],
    ['a string', 'boom'],
    ['null', null],
  ])('reads %s as a bug', (_name, error) => {
    expect(causeOfError(error)).toBe('bug');
  });
});
