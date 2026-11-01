import type { ConvertCode } from '@/application/ports';
import type { PdfFailure } from '@/contracts';

/**
 * What a failed conversion is called on the page. The converter's code stays in the job log; the
 * reason is the closed set a reader gets a sentence for: no answer in time, no converter, a
 * refusal (4xx: the document is the problem), no PDF, too much, or anything else.
 */
export function pdfFailureOf(code: ConvertCode): PdfFailure {
  switch (code) {
    case 'convert.timeout':
      return 'timeout';
    case 'convert.unavailable':
      return 'unavailable';
    case 'convert.not-pdf':
      return 'not-pdf';
    case 'convert.too-large':
      return 'too-large';
    default: {
      const status = Number(code.slice('convert.http.'.length));
      if (status >= 500 && status <= 599) return 'unavailable';
      if (status >= 400 && status <= 499) return 'refused';
      return 'error';
    }
  }
}
