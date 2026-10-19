import { DatabaseFailure } from '@/application/ports';

/** The part of the logger the pipeline uses; pino satisfies it, tests record it. */
export interface Log {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

/**
 * What may be logged about an error. Database errors are logged by SQLSTATE
 * only; our own errors carry no user data (a rule checked in review).
 */
export function errorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof DatabaseFailure) return { name: error.name, sqlstate: error.sqlstate };
  if (!(error instanceof Error)) return { name: typeof error };
  if ('query' in error || 'params' in error || 'severity' in error) {
    const code: unknown = 'code' in error ? error.code : undefined;
    return { name: error.name, ...(typeof code === 'string' && { sqlstate: code }) };
  }
  return { name: error.name, message: error.message, stack: error.stack };
}
