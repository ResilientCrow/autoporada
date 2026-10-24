// The esbuild options of the two Node bundles (ADR 0008, 0015). Shared by the build script and by
// test/arch/worker-bundle.test.ts, so the test bundles exactly what ships.
// The `@/` paths come from tsconfig.json; pg's optional native binding is never used, and
// nodemailer is a devDependency that only the development SMTP transport imports, dynamically.
export const ENTRIES = {
  cli: { in: 'src/cli/main.ts', out: 'dist/cli.mjs' },
  worker: { in: 'src/worker/main.ts', out: 'dist/worker.mjs' },
};

export function nodeBuildOptions(name) {
  const entry = ENTRIES[name];
  return {
    entryPoints: [entry.in],
    outfile: entry.out,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: ['pg-native', 'nodemailer'],
    // CommonJS dependencies (pg) call require(); an ES module has to provide it.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    legalComments: 'external',
    logLevel: 'warning',
  };
}
