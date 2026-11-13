import { describe, expect, it } from 'vitest';

import { DOWNLOAD_ERRORS } from '@/contracts';

import { downloadFailed } from './download';
import { failures } from './failures';
import { errors } from './forms';

describe('downloadFailed', () => {
  it.each([...DOWNLOAD_ERRORS])('has a sentence for %s', (kind) => {
    expect(downloadFailed[kind].trim()).not.toBe('');
  });

  it('says a missing document, or one the reader may not read, in one sentence', () => {
    expect(downloadFailed['not-found']).toBe(
      'Dokument neexistuje, nebo k\u00a0němu nemáte přístup.',
    );
  });

  it('says too many tries as the forms do', () => {
    expect(downloadFailed['rate-limited']).toBe(errors['rate-limited']);
  });

  it('leads every other kind with the failure and follows with its cause', () => {
    expect(downloadFailed['database-down']).toBe(
      `Dokument se nepodařilo stáhnout. ${failures['database-down']}`,
    );
  });
});
