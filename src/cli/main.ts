/**
 * Maintenance commands, run with `pnpm cli <command> …`. A composition root:
 * the only CLI code allowed to wire infrastructure together.
 */
import { randomUUID } from 'node:crypto';

import { SCHEDULES } from '@/application/jobs';
import { getConfig, getDatabaseUrl } from '@/infra/config';
import { databaseOn, openPool } from '@/infra/db';
import { createProducer, withJobsAdmin } from '@/infra/jobs';
import { createLogger } from '@/infra/log';
import { runMigrations } from '@/infra/migrate';
import { formatProbe, loadClientCredential, probeEntra } from '@/infra/oidc';
import { sleepOn, systemClock } from '@/infra/system';

import {
  JOBS_REDRIVE_USAGE,
  JOBS_STATUS_USAGE,
  jobsRedrive,
  jobsStatus,
  type JobsAdmin,
} from './jobs';
import { JOBS_RUN_USAGE, jobsRun } from './jobs-run';
import { MAIL_TEST_USAGE, mailTest } from './mail';
import { renderSnapshot, RENDER_SNAPSHOT_USAGE } from './render-snapshot';

/** Applies pending migrations as the schema owner (the one-shot migrate service). */
async function migrate(): Promise<string[]> {
  await runMigrations(getDatabaseUrl());
  return ['Migrations applied.'];
}

/** Asks Entra for a token with the app's credential: run before the first browser sign-in. */
async function authProbe(): Promise<string[]> {
  const config = getConfig();
  const report = await probeEntra(
    {
      issuer: config.oidc.issuer,
      clientId: config.oidc.clientId,
      appOrigin: config.appOrigin,
      credential: loadClientCredential(config.oidc.credential),
      domainHint: config.oidc.domainHint,
      production: config.environment === 'production',
    },
    new Date(),
  );
  return formatProbe(report);
}

/** A jobs command: pg-boss as the schema owner (DATABASE_URL), open only while it runs. */
const onJobs =
  (command: (admin: JobsAdmin, args: readonly string[]) => Promise<string[]>) =>
  (args: readonly string[]) =>
    withJobsAdmin(getDatabaseUrl(), (admin) => command(admin, args));

const PRODUCER_START_MS = 20_000;

/**
 * `mail:test`: the owner's pool, and a job producer started before the transaction and stopped
 * after it, as the web does. Fails with a hint instead of retrying for ever when the queue is
 * not installed (migrate has not run) or the database is down.
 */
async function mailTestCommand(args: readonly string[]): Promise<string[]> {
  const url = getDatabaseUrl();
  const applicationName = 'autoporada-cli';
  const pool = openPool({ url, applicationName, maxConnections: 2 });
  const producer = createProducer({
    url,
    applicationName,
    log: createLogger({ service: 'cli', level: 'warn' }),
  });
  const giveUp = new AbortController();
  try {
    const up = await Promise.race([
      producer.start().then(() => true),
      sleepOn(PRODUCER_START_MS, giveUp.signal).then(() => false),
    ]);
    if (!up) throw new Error('mail:test: the job queue did not start; has migrate run?');
    const db = databaseOn(pool, { jobsOn: producer.jobsOn }).app;
    return await mailTest({ db, clock: systemClock, newId: randomUUID }, args);
  } finally {
    giveUp.abort();
    await producer.stop();
    await pool.end();
  }
}

const COMMANDS: Readonly<Record<string, (args: readonly string[]) => Promise<string[]>>> = {
  'auth:probe': authProbe,
  'jobs:redrive': onJobs(jobsRedrive),
  'jobs:run': onJobs((admin, args) =>
    jobsRun(admin, args, { schedules: SCHEDULES, now: new Date() }),
  ),
  'jobs:status': onJobs(jobsStatus),
  'mail:test': mailTestCommand,
  migrate,
  'render-snapshot': renderSnapshot,
};

const USAGE = [
  'Usage: pnpm cli <command>',
  '',
  'Commands:',
  '  auth:probe',
  `  ${JOBS_REDRIVE_USAGE}`,
  `  ${JOBS_RUN_USAGE}`,
  `  ${JOBS_STATUS_USAGE}`,
  `  ${MAIL_TEST_USAGE}`,
  '  migrate',
  `  ${RENDER_SNAPSHOT_USAGE}`,
].join('\n');

async function main(argv: readonly string[]): Promise<number> {
  const [name, ...args] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) {
    console.error(USAGE);
    return 1;
  }
  try {
    for (const line of await command(args)) console.log(line);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
