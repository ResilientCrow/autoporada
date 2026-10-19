/**
 * Maintenance commands, run with `pnpm cli <command> …`. A composition root:
 * the only CLI code allowed to wire infrastructure together.
 */
import { getConfig, getDatabaseUrl } from '@/infra/config';
import { runMigrations } from '@/infra/migrate';
import { formatProbe, loadClientCredential, probeEntra } from '@/infra/oidc';

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

const COMMANDS: Readonly<Record<string, (args: readonly string[]) => Promise<string[]>>> = {
  'auth:probe': authProbe,
  migrate,
  'render-snapshot': renderSnapshot,
};

const USAGE = [
  'Usage: pnpm cli <command>',
  '',
  'Commands:',
  '  auth:probe',
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
