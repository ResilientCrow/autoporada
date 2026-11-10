// Branch arch-ui: the Arch UI as the real app's client, written to ../public/arch.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const here = resolve(root, 'arch');
const out = resolve(root, 'public/arch');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { app: resolve(here, 'a/main.tsx') }, bundle: true, minify: true, format: 'iife', jsx: 'automatic', outdir: out,
  alias: { '@': resolve(root, 'src'), zod: resolve(root, 'node_modules/zod') }, // one zod, so jitless covers it
  loader: { '.png': 'file', '.svg': 'file', '.jpg': 'file', '.woff2': 'file' }, publicPath: '/arch/', assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  nodePaths: [resolve(root, 'node_modules')], target: 'es2020', logLevel: 'warning',
});
for (const f of ['logo-dark.svg', 'sign-dark.svg']) copyFileSync(resolve(here, 'a', f), `${out}/${f}`);
console.log('ok');
