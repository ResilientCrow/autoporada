import type { AnyUseCase } from '@/application/core';
import type { AppDeps, UserPrincipal } from '@/application/ports';
import { USE_CASES } from '@/application/use-cases';
import { getConfig, type Config } from '@/infra/config';
import { databaseOn, openPool, type DatabasePool } from '@/infra/db';
import { createLogger, requestIdFrom, type Logger } from '@/infra/log';
import { createIdentityProvider, loadClientCredential } from '@/infra/oidc';
import { systemClock } from '@/infra/system';

import { createRateLimiter, LIMITS, type RateLimiter } from './rate-limit';
import { principalResolver, type AuthDeps } from './session';

/** Everything the web process wires together, once. */
export interface WebContainer {
  readonly app: AppDeps;
  /** The only use cases actions and routes may run. */
  readonly useCases: ReadonlySet<AnyUseCase>;
  /** The signed-in user behind a session cookie, or null (fails closed). */
  readonly resolvePrincipal: (
    token: string | null,
    requestId: string,
  ) => Promise<UserPrincipal | null>;
  /** One per process: the single web replica of ADR 0008. */
  readonly limiter: RateLimiter;
  readonly log: Logger;
  readonly appOrigin: string;
  readonly requestIdFrom: (header: string | null) => string;
  /** The sign-in routes' dependencies (Entra, its expectations, the first headmaster). */
  readonly auth: AuthDeps;
}

/** What the process holds once: state, but no class or object anyone checks the identity of. */
interface Shared {
  readonly pool: DatabasePool;
  readonly limiter: RateLimiter;
}

const SHARED = Symbol.for('autoporada.web.shared');

function shared(config: Config, log: Logger): Shared {
  const holder = globalThis as { [SHARED]?: Shared };
  return (holder[SHARED] ??= {
    pool: openPool({
      url: config.databaseUrl,
      applicationName: 'autoporada-web',
      onConnectionError: (sqlstate) => log.warn({ sqlstate }, 'database connection lost'),
    }),
    limiter: createRateLimiter({ limits: LIMITS, now: () => performance.now() }),
  });
}

/**
 * Composition root of the web process. Building is lazy and opens no
 * connection: the pool connects on the first query.
 */
function buildWeb(config: Config): WebContainer {
  const log = createLogger({ service: 'web', level: config.logLevel });
  const { pool, limiter } = shared(config, log);
  const app: AppDeps = { db: databaseOn(pool).app, clock: systemClock };
  const { oidc } = config;
  const auth: AuthDeps = {
    // Loading the credential checks the key against the certificate: a bad pair stops the boot.
    idp: createIdentityProvider({
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      appOrigin: config.appOrigin,
      credential: loadClientCredential(oidc.credential),
      domainHint: oidc.domainHint,
      production: config.environment === 'production',
    }),
    clock: systemClock,
    appOrigin: config.appOrigin,
    log,
    expect: { issuer: oidc.issuer, clientId: oidc.clientId, tenantId: oidc.tenantId },
    bootstrapHeadmasterOid: config.bootstrapHeadmasterOid ?? null,
  };
  return {
    app,
    useCases: new Set(USE_CASES),
    resolvePrincipal: principalResolver(app),
    limiter,
    log,
    appOrigin: config.appOrigin,
    requestIdFrom,
    auth,
  };
}

let container: WebContainer | undefined;

/**
 * This module instance's container. Next loads instrumentation and the app
 * as separate module instances: a container built by one would hand the
 * other its own copies of the use cases and the port errors, and the
 * registry check and every `instanceof` would fail. So each instance wires
 * its own, over the pool and the rate limiter the process shares.
 */
export function getContainer(): WebContainer {
  return (container ??= buildWeb(getConfig()));
}

/** Validates the configuration before the first request: a misconfigured server refuses to start. */
export function bootWeb(): void {
  const container = getContainer();
  container.log.info({ environment: getConfig().environment }, 'web process configured');
}
