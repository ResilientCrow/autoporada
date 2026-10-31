/**
 * Runs a cron job now, the way an operator does (`jobs:run`), through the bundled CLI (dist/cli.mjs,
 * built by `pnpm build:node` together with the worker) against this run's database. The running
 * worker takes the queued job.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { E2E_ENV } from './env';
import { mailpit } from './mailpit';

const run = promisify(execFile);

/** Queues `job` under its schedule `key` and returns what the command printed. */
async function runJobNow(job: string, key: string): Promise<string> {
  const { stdout } = await run(process.execPath, ['dist/cli.mjs', 'jobs:run', job, key], {
    env: { ...process.env, ...E2E_ENV },
    timeout: 30_000,
  });
  return stdout.trim();
}

const MINUTE_MS = 60_000;
const ATTEMPTS = 3;

/**
 * Runs `job` and returns the first mail it sends to `to`. A run is one per minute (the queue's
 * singleton key), and a run another test queued a moment earlier may have read the data before this
 * test had made it due: then the command says so, and the next minute's run finds it. The mail
 * ledger keeps a second run from sending twice.
 */
export async function runJobForMail(job: string, key: string, to: string) {
  for (let attempt = 1; ; attempt++) {
    await runJobNow(job, key);
    try {
      return await mailpit.waitFor({ to, timeoutMs: 10_000 });
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      await new Promise((done) => setTimeout(done, MINUTE_MS - (Date.now() % MINUTE_MS) + 100));
    }
  }
}
