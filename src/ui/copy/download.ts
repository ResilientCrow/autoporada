import type { DownloadError } from '@/contracts';

import { failures } from './failures';
import { errors } from './forms';

const FAILED = 'Dokument se nepodařilo stáhnout.';

/**
 * What a download that gave no file says (ADR 0044), whole, for the screen it lands on: a missing
 * document or too many tries by themselves, every other cause after „Dokument se nepodařilo
 * stáhnout.“
 */
export const downloadFailed = {
  ...(Object.fromEntries(
    Object.entries(failures).map(([cause, text]) => [cause, `${FAILED} ${text}`]),
  ) as Record<Exclude<DownloadError, 'not-found' | 'rate-limited'>, string>),
  'not-found': 'Dokument neexistuje, nebo k\u00a0němu nemáte přístup.',
  'rate-limited': errors['rate-limited'],
} as const satisfies Record<DownloadError, string>;
