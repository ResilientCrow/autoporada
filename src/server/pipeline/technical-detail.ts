import { sqlstateOf } from '@/application/core';
import type { FailureCause, SignInError } from '@/contracts';

/** The one technical line a failure may carry beside its sentence; see `technicalDetail`. */
export type DescribeFailure = (error: unknown, cause: FailureCause) => string;

const MAX_DETAIL = 200;
const DEFAULT_PORT = '5432';
/** What starts the database, the mock IdP and the rest locally. */
const START_SERVICES = 'spusťte pnpm dev:services';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Where development's services are: the OIDC issuer and the database's `host:port`. */
export interface DevServices {
  readonly issuer: string;
  readonly database: string | undefined;
}

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
    if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, MAX_DETAIL);
    return typeof error;
  };
}

/** The issuer as origin and path: no credentials, query or fragment. Undefined when unreadable. */
function issuerAddress(
  issuer: string,
): { readonly href: string; readonly local: boolean } | undefined {
  try {
    const { origin, pathname, hostname } = new URL(issuer);
    if (origin === 'null') return undefined;
    const local = LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
    return { href: `${origin}${pathname === '/' ? '' : pathname}`, local };
  } catch {
    return undefined;
  }
}

/**
 * Development's technical line on the sign-in page (ADR 0044): for Entra being down or its answer
 * not verifying, which issuer that was (a localhost one is the mock IdP, which `pnpm dev:services`
 * starts); for a lost database, where it is. Null for anything else, and wherever `services` is
 * absent, as in production.
 */
export function signInTechnical(
  error: SignInError | null,
  services: DevServices | undefined,
): string | null {
  if (services === undefined) return null;
  if (error === 'unavailable' || error === 'idp-invalid') {
    const issuer = issuerAddress(services.issuer);
    if (issuer === undefined) return null;
    const hint = issuer.local ? ` (mock IdP, ${START_SERVICES})` : '';
    return `OIDC issuer ${issuer.href}${hint}`.slice(0, MAX_DETAIL);
  }
  if (error === 'database-down' && services.database !== undefined) {
    return `databáze na ${services.database}, ${START_SERVICES}`.slice(0, MAX_DETAIL);
  }
  return null;
}
