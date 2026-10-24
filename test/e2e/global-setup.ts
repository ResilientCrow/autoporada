/**
 * Every run gets its own database, cloned from the migrated template and
 * seeded. Playwright starts the web server before this runs, so nothing may
 * touch the e2e database earlier (the pool is lazy) and this never calls /auth/*;
 * a reused server survives the drop with one connection warning.
 *
 * Then the bundled worker is started against it (dist/worker.mjs, what the
 * worker image runs), and stopped with SIGTERM after the run, which must end
 * with exit code 0.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { databaseUrl, ensureTemplate, recreateFromTemplate } from '../support/template-db';

import { E2E_DATABASE } from './db';
import { E2E_WORKER_ENV } from './env';
import { seed } from './seed';

const BUNDLE = join('dist', 'worker.mjs');
const READY_WITHIN_MS = 60_000;
/** The worker's stop timeout (35 s) and a margin; compose gives it 50 s. */
const STOP_WITHIN_MS = 40_000;
const READY = '"msg":"worker.ready"';

/** The newest source file's mtime: the bundle must not be older than the code it was built from. */
function newestSource(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || /\.test\.tsx?$/.test(entry.name)) continue;
    newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }
  return newest;
}

function checkBundle(): void {
  let builtAt: number;
  try {
    builtAt = statSync(BUNDLE).mtimeMs;
  } catch {
    throw new Error(`${BUNDLE} is missing: run \`pnpm build:node\` (playwright's web server does)`);
  }
  if (builtAt < newestSource('src')) {
    throw new Error(`${BUNDLE} is older than src/: run \`pnpm build:node\` and try again`);
  }
}

/** Starts the worker and resolves with it once it logs worker.ready. */
function startWorker(): Promise<{ child: ChildProcess; output: () => string }> {
  const child = spawn(process.execPath, [BUNDLE], {
    env: { ...process.env, ...E2E_WORKER_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  const collect = (chunk: Buffer): void => {
    text = (text + chunk.toString()).slice(-8_000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const output = (): string => text;
  return new Promise((resolve, reject) => {
    const fail = (why: string): void => {
      clearTimeout(timer);
      clearInterval(poll);
      child.kill('SIGKILL');
      reject(new Error(`the e2e worker ${why}; its output:\n${text}`));
    };
    const timer = setTimeout(() => {
      fail(`did not log worker.ready within ${READY_WITHIN_MS / 1000} s`);
    }, READY_WITHIN_MS);
    const poll = setInterval(() => {
      if (!text.includes(READY)) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve({ child, output });
    }, 100);
    child.once('exit', (code, signal) => {
      fail(`exited before it was ready (${signal ?? code})`);
    });
  });
}

/** SIGTERM, then the exit must be a clean 0 within the stop budget. */
async function stopWorker({ child, output }: Awaited<ReturnType<typeof startWorker>>) {
  child.removeAllListeners('exit');
  const exit = new Promise<string>((resolve) => {
    child.once('exit', (code, signal) => {
      resolve(signal ? `signal ${signal}` : `code ${String(code)}`);
    });
  });
  if (child.exitCode !== null)
    throw new Error(`the e2e worker had already exited (${child.exitCode})`);
  child.kill('SIGTERM');
  const result = await Promise.race([
    exit,
    new Promise<string>((resolve) => setTimeout(resolve, STOP_WITHIN_MS, 'timeout')),
  ]);
  if (result !== 'code 0') {
    child.kill('SIGKILL');
    throw new Error(
      `the e2e worker did not stop cleanly on SIGTERM (${result}); its output:\n${output()}`,
    );
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  checkBundle();
  await ensureTemplate();
  await recreateFromTemplate(E2E_DATABASE);
  await seed(databaseUrl(E2E_DATABASE));
  const worker = await startWorker();
  return () => stopWorker(worker);
}
