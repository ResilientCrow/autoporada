import { describe, expect, it } from 'vitest';

import { causeFromDigest, FAILURE_CAUSES } from '@/contracts';

import { PageFailure } from './page-failure';

describe('PageFailure', () => {
  it.each(FAILURE_CAUSES)('carries %s in its digest, which error.tsx reads back', (cause) => {
    const failure = new PageFailure(cause, 'points.get: unavailable');
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe('PageFailure');
    expect(causeFromDigest(failure.digest)).toBe(cause);
  });

  it('keeps the message it is given, which names the call and never the user’s data', () => {
    expect(new PageFailure('timeout', 'users.get: busy').message).toBe('users.get: busy');
  });
});
