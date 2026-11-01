import { readFileSync } from 'node:fs';

import type { AnyUseCase } from '@/application/core';
import type { AppDeps, DirectoryPort, UserPrincipal } from '@/application/ports';
import { USE_CASES } from '@/application/use-cases';
import { getConfig, requireServerActionsKey, type Config } from '@/infra/config';
import { databaseOn, openPool, type DatabasePool } from '@/infra/db';
import { createDirectory } from '@/infra/directory';
import { createProducer } from '@/infra/jobs';
import { createLogger, requestIdFrom, type Logger } from '@/infra/log';
import {
  createAppTokenSource,
  createIdentityProvider,
  describeCredential,
  GRAPH_SCOPE,
  loadClientCredential,
} from '@/infra/oidc';
import { systemClock } from '@/infra/system';

import {
  databaseAddress,
  technicalDetail,
  type DescribeFailure,
  type DevServices,
} from './pipeline';
import { createRateLimiter, LIMITS, type RateLimiter } from './rate-limit';
import { principalResolver, type AuthDeps } from './auth';

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
  /** Development's technical line for a failure; absent in production (ADR 0044). */
  readonly describe?: DescribeFailure;
  /** Where development's services are, for the sign-in page's technical line; absent in production. */
  readonly devServices?: DevServices;
  readonly appOrigin: string;
  /** Where this process runs; the pattern gallery is closed in production. */
  readonly environment: Config['environment'];
  readonly requestIdFrom: (header: string | null) => string;
  /** The sign-in routes' dependencies (Entra, its expectations, the first headmaster). */
  readonly auth: AuthDeps;
  /** People search for the search route; answers `directory.off` unless the configuration turns it on. */
  readonly directory: DirectoryPort;
  /**
   * What the pages tell the people picker: whether the school directory is searched at all
   * (`off` under `DIRECTORY=off`, so the picker says so up front and never calls the route).
   * The same two words as the picker's `Directory`, which the server may not import.
   */
  readonly directoryMode: 'on' | 'off';
  /** What the boot log says about this process. */
  readonly bootReport: (now: Date) => BootReport;
}

interface BootReport {
  readonly facts: Record<string, unknown>;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** What the process holds once: state, but no class or object anyone checks the identity of. */
interface Shared {
  readonly pool: DatabasePool;
  /** Sends jobs inside the use cases' transactions; connects only once `startProducer()` runs. */
  readonly producer: ReturnType<typeof createProducer>;
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
    producer: createProducer({
      url: config.databaseUrl,
      applicationName: 'autoporada-web',
      log,
    }),
    limiter: createRateLimiter({ limits: LIMITS, now: () => performance.now() }),
  });
}

/**
 * Composition root of the web process. Building is lazy and opens no
 * connection: the pool connects on the first query, and the job producer
 * only when `startProducer()` is called.
 */
function buildWeb(config: Config): WebContainer {
  requireServerActionsKey(config);
  const log = createLogger({ service: 'web', level: config.logLevel });
  const { pool, producer, limiter } = shared(config, log);
  const app: AppDeps = {
    db: databaseOn(pool, { jobsOn: producer.jobsOn }).app,
    clock: systemClock,
  };
  const { oidc } = config;
  // Loading the credential checks the key against the certificate: a bad pair stops the boot.
  const credential = loadClientCredential(oidc.credential);
  // A bad dev file stops the boot, like a bad credential above. `graph` searches with the app's own
  // token, from the registration the web signs in with: in production that is the web's own
  // registration, which holds `User.ReadBasic.All` and never the mail scope (ADR 0021; the compose
  // file gives the web service its client id and certificate). Production stays DIRECTORY=off until
  // the tenant's smoke test.
  const directory = createDirectory(config.directory, {
    readFile: (path) => readFileSync(path, 'utf8'),
    graphBaseUrl: config.graphBaseUrl,
    graphTokens: () =>
      createAppTokenSource({
        provider: {
          issuer: oidc.issuer,
          clientId: oidc.clientId,
          appOrigin: config.appOrigin,
          credential,
          domainHint: oidc.domainHint,
          production: config.environment === 'production',
        },
        scope: GRAPH_SCOPE,
        clock: systemClock,
      }),
  });
  const auth: AuthDeps = {
    idp: createIdentityProvider({
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      appOrigin: config.appOrigin,
      credential,
      domainHint: oidc.domainHint,
      production: config.environment === 'production',
    }),
    clock: systemClock,
    appOrigin: config.appOrigin,
    log,
    expect: { issuer: oidc.issuer, clientId: oidc.clientId, tenantId: oidc.tenantId },
    bootstrapHeadmasterOid: config.bootstrapHeadmasterOid ?? null,
  };
  const database = databaseAddress(config.databaseUrl);
  const describe = technicalDetail(config.environment, database);
  const devServices: DevServices | undefined =
    config.environment === 'production' ? undefined : { issuer: oidc.issuer, database };
  return {
    app,
    useCases: new Set(USE_CASES),
    resolvePrincipal: principalResolver(app),
    limiter,
    log,
    ...(describe && { describe }),
    ...(devServices && { devServices }),
    appOrigin: config.appOrigin,
    environment: config.environment,
    requestIdFrom,
    auth,
    directory,
    directoryMode: config.directory.kind === 'off' ? 'off' : 'on',
    bootReport: (now) => {
      const { facts, errors, warnings } = describeCredential(credential, now);
      return {
        facts: {
          environment: config.environment,
          credential: facts,
          directory: config.directory.kind,
        },
        errors,
        warnings: config.bootstrapHeadmasterOid ? [...warnings, BOOTSTRAP_STILL_SET] : warnings,
      };
    },
  };
}

const BOOTSTRAP_STILL_SET =
  'BOOTSTRAP_HEADMASTER_OID is set: empty it once the headmaster has signed in (plan §4)';

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

/**
 * Validates the configuration before the first request: a misconfigured
 * server refuses to start. Then says what it runs with, and what needs doing.
 */
export function bootWeb(): void {
  const { log, bootReport } = getContainer();
  const { facts, errors, warnings } = bootReport(systemClock.now());
  log.info(facts, 'web process configured');
  for (const error of errors) log.error({}, error);
  for (const warning of warnings) log.warn({}, warning);
}

/**
 * Starts the job producer, outside any transaction (it is called from instrumentation, never from
 * a use case). Does not wait: a web that boots before the database retries on its own and logs
 * each failure, and until it is up an enqueue fails at once, so the use case rolls back and the
 * user sees "unavailable". A second call changes nothing.
 */
export function startProducer(): void {
  getContainer();
  const holder = globalThis as { [SHARED]?: Shared };
  void holder[SHARED]?.producer.start();
}

/** Ends the retrying start and stops the producer; tests call it so nothing outlives them. */
export async function stopProducer(): Promise<void> {
  const holder = globalThis as { [SHARED]?: Shared };
  await holder[SHARED]?.producer.stop();
}
