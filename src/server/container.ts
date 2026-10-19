import type { AnyUseCase } from '@/application/core';
import type { AppDeps, UserPrincipal } from '@/application/ports';
import { USE_CASES } from '@/application/use-cases';
import { getConfig, type Config } from '@/infra/config';
import { connectDatabase } from '@/infra/db';
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

/**
 * Composition root of the web process. Building is lazy and opens no
 * connection: the pool connects on the first query.
 */
export function buildWeb(config: Config): WebContainer {
  const log = createLogger({ service: 'web', level: config.logLevel });
  const database = connectDatabase({
    url: config.databaseUrl,
    applicationName: 'autoporada-web',
    onConnectionError: (sqlstate) => log.warn({ sqlstate }, 'database connection lost'),
  });
  const app: AppDeps = { db: database.app, clock: systemClock };
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
    limiter: createRateLimiter({ limits: LIMITS, now: () => performance.now() }),
    log,
    appOrigin: config.appOrigin,
    requestIdFrom,
    auth,
  };
}

const KEY = Symbol.for('autoporada.web');
type Holder = { [KEY]?: WebContainer };

/**
 * The process's container. Next loads instrumentation and the server
 * components as separate module instances, so a module-level singleton
 * would build two pools; globalThis is shared by both.
 */
export function getContainer(): WebContainer {
  const holder = globalThis as Holder;
  return (holder[KEY] ??= buildWeb(getConfig()));
}

/** Validates the configuration before the first request: a misconfigured server refuses to start. */
export function bootWeb(): void {
  const container = getContainer();
  container.log.info({ environment: getConfig().environment }, 'web process configured');
}
