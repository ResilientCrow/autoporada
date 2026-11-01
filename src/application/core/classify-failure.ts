import type { FailureCause } from '@/contracts';

import { DatabaseFailure, LockTimeout } from '../ports';

/**
 * Which of the closed set of causes an unexpected failure is (ADR 0044). Pure: the
 * code that catches it asks, so the page can say what broke instead of a code.
 * Only the SQLSTATE is read, never a message.
 */
export function classifyFailure(error: unknown): FailureCause {
  // A lock not granted in time is a wait that ran out, like a statement timeout.
  if (error instanceof LockTimeout) return 'timeout';
  const code = sqlstateOf(error);
  return code === undefined ? 'bug' : classifyCode(code);
}

/** The SQLSTATE or schema code a failure carries, if it is a database failure. */
export function sqlstateOf(error: unknown): string | undefined {
  if (error instanceof DatabaseFailure) return error.sqlstate;
  // A raw driver error that reached the pipeline unmapped: Application may not import pg.
  if (error instanceof Error && ('severity' in error || 'query' in error || 'params' in error)) {
    const code: unknown = 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && code.length === 5) return code;
  }
  return undefined;
}

const DOWN = new Set(['57P01', '57P02', '57P03']);
/** Statement, idle-in-transaction and transaction timeouts: all a wait that ran out (ADR 0045). */
const TIMEOUT = new Set(['57014', '25P03', '25P04']);
const SETUP = new Set(['42P01', '42703', '42883', '42501', '3D000']);

function classifyCode(code: string): FailureCause {
  if (code.startsWith('db.parse.') || code.startsWith('settings.invalid.')) return 'stored-data';
  if (TIMEOUT.has(code)) return 'timeout';
  if (code.startsWith('08') || code.startsWith('53') || DOWN.has(code)) return 'database-down';
  if (code.startsWith('28') || SETUP.has(code)) return 'database-setup';
  return 'bug';
}
