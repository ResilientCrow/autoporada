// Bundles the maintenance CLI into one file for the tools image (ADR 0008).
// The `@/` paths come from tsconfig.json; pg's optional native binding is
// never used.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli/main.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['pg-native'],
  // CommonJS dependencies (pg) call require(); an ES module has to provide it.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  legalComments: 'external',
  logLevel: 'warning',
});
