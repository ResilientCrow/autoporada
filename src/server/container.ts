import type { AppDeps, UserPrincipal } from '@/application/ports';
import { getConfig, type Config } from '@/infra/config';
import { connectDatabase } from '@/infra/db';
import { createLogger, requestIdFrom, type Logger } from '@/infra/log';
import { systemClock } from '@/infra/system';

/** Everything the web process wires together, once. */
export interface WebContainer {
  readonly app: AppDeps;
  /** The signed-in user behind a session cookie, or null (fails closed). */
  readonly resolvePrincipal: (
    token: string | null,
    requestId: string,
  ) => Promise<UserPrincipal | null>;
  readonly log: Logger;
  readonly appOrigin: string;
  readonly requestIdFrom: (header: string | null) => string;
}

/**
 * Composition root of the web process. Building is lazy and opens no
 * connection: the pool connects on the first query.
 */
export function buildWeb(config: Config): WebContainer {
  const database = connectDatabase({
    url: config.databaseUrl,
    applicationName: 'autoporada-web',
  });
  return {
    app: { db: database.app, clock: systemClock },
    // Sessions arrive in M4.4; until then nobody is signed in.
    resolvePrincipal: async () => null,
    log: createLogger({ service: 'web', level: config.logLevel }),
    appOrigin: config.appOrigin,
    requestIdFrom,
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
