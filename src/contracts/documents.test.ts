import { describe, expect, it } from 'vitest';

import { DOWNLOAD_ERRORS, isDownloadError } from './documents';
import { FAILURE_CAUSES } from './failure';

describe('download errors', () => {
  it('are the five failure causes, a rate limit and a missing document', () => {
    expect([...DOWNLOAD_ERRORS].sort()).toEqual(
      [...FAILURE_CAUSES, 'not-found', 'rate-limited'].sort(),
    );
  });

  it.each([...DOWNLOAD_ERRORS])('accepts %s', (value) => {
    expect(isDownloadError(value)).toBe(true);
  });

  it.each([undefined, null, '', 'forbidden', 'unauthenticated', 'BUG', 'bug ', 5, ['bug']])(
    'ignores %j',
    (value) => {
      expect(isDownloadError(value)).toBe(false);
    },
  );
});
