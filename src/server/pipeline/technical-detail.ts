import { sqlstateOf } from '@/application/core';
import type { FailureCause } from '@/contracts';

/** The one technical line a failure may carry beside its sentence; see `technicalDetail`. */
export type DescribeFailure = (error: unknown, cause: FailureCause) => string;

const MAX_DETAIL = 200;
const DEFAULT_PORT = '5432';
/** What starts the database, the mock IdP and the rest locally. */
const START_SERVICES = 'spusťte pnpm dev:services';

/**
 * Where the database is, as `host:port`: never the user, password, database name or query of the
 * URL. Undefined when the URL cannot be read, so a malformed value is not echoed back either.
 */
export function databaseAddress(databaseUrl: string): string | undefined {
  try {
    const { hostname, port } = new URL(databaseUrl);
    return hostname === '' ? undefined : `${hostname}:${port || DEFAULT_PORT}`;
  } catch {
    return undefined;
  }
}

/** An error from the database layer, whose message can quote a statement or a stored value. */
const isQueryShaped = (error: Error): boolean =>
  'query' in error || 'params' in error || 'severity' in error;

/**
 * Development's technical line (ADR 0044): the error's name and SQLSTATE, and for a lost database
 * where it is and how to start it. Production gets no function at all, so nothing technical can be
 * sent there; the container binds the result into `ActionDeps.describe`. A database error is never
 * quoted by message, since a driver message can carry a stored value.
 */
export function technicalDetail(
  environment: 'development' | 'test' | 'production',
  address: string | undefined,
): DescribeFailure | undefined {
  if (environment === 'production') return undefined;
  return (error, cause) => {
    const code = sqlstateOf(error);
    if (code !== undefined) {
      const name = error instanceof Error ? error.name : 'Error';
      const where =
        cause === 'database-down' && address ? ` (databáze na ${address}, ${START_SERVICES})` : '';
      return `${name} ${code}${where}`.slice(0, MAX_DETAIL);
    }
    if (error instanceof Error) {
      // A query error (Drizzle's has no code) carries the SQL and its parameters in its message.
      if (isQueryShaped(error)) return error.name.slice(0, MAX_DETAIL);
      return `${error.name}: ${error.message}`.slice(0, MAX_DETAIL);
    }
    return typeof error;
  };
}
