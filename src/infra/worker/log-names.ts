import type { JobOutcome } from '@/application/ports';

/**
 * The worker's fixed log message names (ADR 0016): IT greps for them. A job's
 * line carries ids and its outcome code only, never an address.
 */
type LogName =
  | 'mail.sent'
  | 'mail.skipped'
  | 'mail.waiting'
  | 'mail.deferred'
  | 'mail.unknown'
  | 'mail.resend_unknown_outcome'
  | 'mail.systemic'
  | 'job.done'
  | 'job.retry'
  | 'job.dead';

interface LogLine {
  readonly name: LogName;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly hint?: string;
}

const SYSTEMIC_HINT =
  'check Exchange RBAC scope (docs/ENTRA-SETUP.md §3); access can take up to 2 h to propagate';

/** `auth` matches `auth` and `auth.403`, never `authority`. */
const family = (code: string, ...prefixes: readonly string[]) =>
  prefixes.some((prefix) => code === prefix || code.startsWith(`${prefix}.`));

function retryLine(code: string): LogLine {
  if (family(code, 'auth')) return { name: 'mail.systemic', level: 'warn', hint: SYSTEMIC_HINT };
  if (family(code, 'unknown')) return { name: 'mail.unknown', level: 'warn' };
  if (family(code, 'net', 'throttled', 'deferred')) return { name: 'mail.deferred', level: 'warn' };
  return { name: 'job.retry', level: 'warn' };
}

function doneLine(code: string): LogLine {
  if (code === 'sent') return { name: 'mail.sent', level: 'info' };
  if (code === 'resent') return { name: 'mail.resend_unknown_outcome', level: 'warn' };
  if (family(code, 'skipped', 'already')) return { name: 'mail.skipped', level: 'info' };
  return { name: 'job.done', level: 'info' };
}

/** The message name and level the runner logs an outcome under. */
export function logLineFor(outcome: Pick<JobOutcome, 'kind' | 'code'>): LogLine {
  switch (outcome.kind) {
    case 'done':
      return doneLine(outcome.code);
    case 'wait':
      return { name: 'mail.waiting', level: 'debug' };
    case 'retry':
      return retryLine(outcome.code);
    case 'dead':
      return { name: 'job.dead', level: 'error' };
  }
}
