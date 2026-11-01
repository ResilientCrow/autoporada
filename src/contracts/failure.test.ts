import { describe, expect, it } from 'vitest';

import { causeFromDigest, FAILURE_CAUSES, failureDigest } from './failure';

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
