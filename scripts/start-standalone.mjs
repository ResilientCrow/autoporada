// Runs the standalone build the same way the Docker image does: static assets
// are copied next to server.js, then the server starts on $PORT.
import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';

const out = '.next/standalone';
if (!existsSync(`${out}/server.js`)) {
  console.error('No standalone build found. Run `pnpm build` first.');
  process.exit(1);
}
cpSync('.next/static', `${out}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${out}/public`, { recursive: true });

const server = spawn(process.execPath, [`${out}/server.js`], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
