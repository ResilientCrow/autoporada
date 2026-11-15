// Branch arch-ui: the Arch UI as the real app's client, written to ../public/arch.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const here = resolve(root, 'arch');
const out = resolve(root, 'public/arch');
rmSync(resolve(out, 'chunks'), { recursive: true, force: true }); // hashed names: a rebuild must not leave the old chunks beside the new
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { app: resolve(here, 'a/main.tsx') }, bundle: true, minify: true, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]', jsx: 'automatic', outdir: out,
  alias: { '@': resolve(root, 'src'), zod: resolve(root, 'node_modules/zod') }, // one zod, so jitless covers it
  loader: { '.png': 'file', '.svg': 'file', '.jpg': 'file', '.woff2': 'file' }, publicPath: '/arch/', assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  nodePaths: [resolve(root, 'node_modules')], target: 'es2020', logLevel: 'warning',
});
// pdf.js reads PDFs in this worker; the page's CSP allows workers from 'self' (ADR 0066).
copyFileSync(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), `${out}/pdf.worker.min.mjs`);
for (const f of ['logo-dark.svg', 'sign-dark.svg']) copyFileSync(resolve(here, 'a', f), `${out}/${f}`);
console.log('ok');
