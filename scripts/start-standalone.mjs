// Runs the standalone build the same way the Docker image does: static assets
// are copied next to server.js, then the server starts on $PORT.
import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { constants } from 'node:os';

const out = '.next/standalone';
if (!existsSync(`${out}/server.js`)) {
  console.error('No standalone build found. Run `pnpm build` first.');
  process.exit(1);
}
cpSync('.next/static', `${out}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${out}/public`, { recursive: true });

// server.js binds to $HOSTNAME, which shells and Docker set to the machine
// name. Bind explicitly instead (override with BIND_HOST).
const env = { ...process.env, HOSTNAME: process.env.BIND_HOST ?? '0.0.0.0' };
const server = spawn(process.execPath, [`${out}/server.js`], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));

// A server killed by a signal must not look like a clean exit (128 + signo).
server.on('exit', (code, signal) => {
  process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : (code ?? 1));
});
