/**
 * The worker process (ADR 0015): works the job queues and sends the mail. A composition root,
 * like server/container.ts and cli/main.ts; what is worth testing lives in infra/worker.
 */
import { JOB_HANDLERS, SCHEDULES } from '@/application/jobs';
import type { WorkerDeps } from '@/application/ports';
import { ConfigError, getConfig } from '@/infra/config';
import { databaseOn, openPool } from '@/infra/db';
import { createBoss, createProducer, errorCode, PGBOSS_SCHEMA_VERSION } from '@/infra/jobs';
import { createLogger } from '@/infra/log';
import { createMailPort } from '@/infra/mail';
import { createAppTokenSource, describeCredential, loadClientCredential } from '@/infra/oidc';
import { systemClock } from '@/infra/system';
import { startHealth, startWorker, type RunningWorker } from '@/infra/worker';

import app from '../../package.json' with { type: 'json' };

const APPLICATION_NAME = 'autoporada-worker';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

async function main(): Promise<void> {
  const config = getConfig();
  const log = createLogger({ service: 'worker', level: config.logLevel });

  // A bad key and certificate pair stops the boot; their expiry is M11's ops.check, not a ticker here.
  const credential = loadClientCredential(config.oidc.credential);
  const { facts, errors, warnings } = describeCredential(credential, systemClock.now());
  log.info({ credential: facts }, 'worker credential');
  for (const error of errors) log.error({}, error);
  for (const warning of warnings) log.warn({}, warning);

  const pool = openPool({
    url: config.databaseUrl,
    applicationName: APPLICATION_NAME,
    maxConnections: 4,
    onConnectionError: (sqlstate) => log.warn({ sqlstate }, 'database connection lost'),
  });
  const boss = createBoss('worker', {
    url: config.databaseUrl,
    applicationName: APPLICATION_NAME,
    log,
  });
  // Lets handlers enqueue inside their transactions (M8's); like the web's, it retries its own start.
  const producer = createProducer({
    url: config.databaseUrl,
    applicationName: APPLICATION_NAME,
    log,
  });
  void producer.start();

  const tokens = createAppTokenSource({
    provider: {
      issuer: config.oidc.issuer,
      clientId: config.oidc.clientId,
      appOrigin: config.appOrigin,
      credential,
      domainHint: config.oidc.domainHint,
      production: config.environment === 'production',
    },
    scope: GRAPH_SCOPE,
    clock: systemClock,
  });
  const deps: WorkerDeps = {
    db: databaseOn(pool, { jobsOn: producer.jobsOn }).app,
    clock: systemClock,
    mail: createMailPort(config, { tokens, clock: systemClock }),
    appOrigin: config.appOrigin,
  };

  // A signal may come while the worker starts: startWorker then stops between steps, and the
  // stop waits for that, so a handler call already running finishes before the pool closes.
  const stopping = new AbortController();
  const running: { worker?: Promise<RunningWorker>; health?: ReturnType<typeof startHealth> } = {};
  let signalled = false;
  const shutDown = async (): Promise<void> => {
    log.info({}, 'worker.stopping');
    stopping.abort();
    running.health?.stop();
    // a start that failed has nothing to stop; main() reports it
    const worker = await running.worker?.catch(() => undefined);
    await worker?.stop();
    await producer.stop();
    await pool.end();
    log.info({}, 'worker.stopped');
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    if (signalled) {
      log.error({ signal }, 'worker.forced');
      process.exit(1);
    }
    signalled = true;
    void shutDown().then(
      () => process.exit(0),
      (error: unknown) => {
        log.error({ code: errorCode(error) }, 'worker.stop_failed');
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  running.worker = startWorker({
    boss,
    handlers: JOB_HANDLERS,
    schedules: SCHEDULES,
    deps,
    log,
    pollSeconds: config.worker.pollSeconds,
    facts: {
      version: app.version,
      pgbossSchema: PGBOSS_SCHEMA_VERSION,
      transport: config.mail.transport,
    },
    signal: stopping.signal,
  });
  await running.worker;
  if (stopping.signal.aborted) return;
  running.health = startHealth({ ping: () => pool.query('SELECT 1'), clock: systemClock, log });
}

try {
  await main();
} catch (error) {
  // A bad setting is named by key, never by value; anything else by its class and code (a message can quote a URL).
  const fields =
    error instanceof ConfigError
      ? { problems: error.problems }
      : { name: error instanceof Error ? error.name : 'unknown', code: errorCode(error) };
  const cause = error instanceof Error && typeof error.cause === 'string' ? error.cause : undefined;
  createLogger({ service: 'worker', level: 'info' }).fatal({ ...fields, cause }, 'worker.failed');
  process.exit(1);
}
