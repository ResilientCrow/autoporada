import { describe, expect, it } from 'vitest';

import { DOWNLOAD_ERRORS, documentInfo, isDownloadError, PDF_FAILURES } from './documents';
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

describe('PDF failures', () => {
  it('are the six reasons a conversion can fail for, once each', () => {
    expect([...PDF_FAILURES].sort()).toEqual(
      ['error', 'not-pdf', 'refused', 'timeout', 'too-large', 'unavailable'].sort(),
    );
  });

  it('are what a document’s info may carry, or none', () => {
    const base = { generatedAt: '2026-11-09T13:05:00.000Z', pdfStatus: 'failed' as const };
    for (const pdfFailure of [...PDF_FAILURES, null]) {
      expect(documentInfo.safeParse({ ...base, pdfFailure }).success, String(pdfFailure)).toBe(
        true,
      );
    }
    expect(documentInfo.safeParse({ ...base, pdfFailure: 'fire' }).success).toBe(false);
    expect(documentInfo.safeParse(base).success).toBe(false);
  });
});
