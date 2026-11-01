import { describe, expect, it } from 'vitest';

import type { ConvertCode } from '@/application/ports';
import { PDF_FAILURES } from '@/contracts';

import { pdfFailureOf } from './pdf-failure';

describe('pdfFailureOf', () => {
  it.each<[ConvertCode, string]>([
    ['convert.timeout', 'timeout'],
    ['convert.unavailable', 'unavailable'],
    ['convert.http.500', 'unavailable'],
    ['convert.http.502', 'unavailable'],
    ['convert.http.503', 'unavailable'],
    ['convert.http.599', 'unavailable'],
    ['convert.http.400', 'refused'],
    ['convert.http.413', 'refused'],
    ['convert.http.422', 'refused'],
    ['convert.http.499', 'refused'],
    ['convert.not-pdf', 'not-pdf'],
    ['convert.too-large', 'too-large'],
    // A redirect (the converter follows none) and any status outside 4xx and 5xx are no one's fault.
    ['convert.http.301', 'error'],
    ['convert.http.399', 'error'],
    ['convert.http.200', 'error'],
    ['convert.http.600', 'error'],
    ['convert.http.0', 'error'],
  ])('reads %s as %s', (code, reason) => {
    expect(pdfFailureOf(code)).toBe(reason);
  });

  it('reads a code it does not know as an error', () => {
    expect(pdfFailureOf('convert.something-new' as ConvertCode)).toBe('error');
  });

  it('only ever names a reason of the closed set', () => {
    const codes: ConvertCode[] = [
      'convert.timeout',
      'convert.unavailable',
      'convert.http.404',
      'convert.http.502',
      'convert.not-pdf',
      'convert.too-large',
    ];
    for (const code of codes) expect(PDF_FAILURES).toContain(pdfFailureOf(code));
  });
});
