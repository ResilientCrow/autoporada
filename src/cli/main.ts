/**
 * Maintenance commands, run with `pnpm cli <command> …`. A composition root:
 * the only CLI code allowed to wire infrastructure together.
 */
import { getDatabaseUrl } from '@/infra/config';
import { runMigrations } from '@/infra/migrate';

import { renderSnapshot, RENDER_SNAPSHOT_USAGE } from './render-snapshot';

/** Applies pending migrations as the schema owner (the one-shot migrate service). */
async function migrate(): Promise<string[]> {
  await runMigrations(getDatabaseUrl());
  return ['Migrations applied.'];
}

const COMMANDS: Readonly<Record<string, (args: readonly string[]) => Promise<string[]>>> = {
  migrate,
  'render-snapshot': renderSnapshot,
};

const USAGE = [
  'Usage: pnpm cli <command>',
  '',
  'Commands:',
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
