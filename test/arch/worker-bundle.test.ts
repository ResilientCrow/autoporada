import { builtinModules } from 'node:module';

import { build, type BuildOptions, type Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';

// The options scripts/build-node.mjs builds with, so this test bundles what ships.
// @ts-expect-error the script is plain JavaScript without types
import { nodeBuildOptions } from '../../scripts/node-build-options.mjs';

const SMTP = 'src/infra/mail/smtp.ts';
/** The slow part (pg-boss and the whole graph), bundled once. */
const bundled = (async () => {
  const options = (nodeBuildOptions as (entry: string) => BuildOptions)('worker');
  const result = await build({
    ...options,
    outfile: undefined,
    outdir: 'unused',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const [file] = result.outputFiles;
  return { metafile: result.metafile, code: file?.text ?? '' };
})();

const importsOf = (metafile: Metafile, path: string) => metafile.inputs[path]?.imports ?? [];

describe('the worker bundle (ADR 0016: nodemailer is development only)', () => {
  it('reaches nodemailer only through a dynamic import in the SMTP transport', async () => {
    const { metafile } = await bundled;
    const importers = Object.entries(metafile.inputs).filter(([, input]) =>
      input.imports.some((record) => record.path === 'nodemailer'),
    );
    expect(importers.map(([path]) => path)).toEqual([SMTP]);
    const records = importsOf(metafile, SMTP).filter((record) => record.path === 'nodemailer');
    expect(records.map((record) => record.kind)).toEqual(['dynamic-import']);
    expect(records.every((record) => record.external)).toBe(true);
  });

  it('holds no static import of nodemailer in the output', async () => {
    const { code } = await bundled;
    expect(code).not.toMatch(/^\s*import[^;]*from\s*["']nodemailer["']/m);
    expect(code).not.toMatch(/require\(\s*["']nodemailer["']\s*\)/);
    expect(code).toMatch(/import\(\s*["']nodemailer["']\s*\)/);
  });

  it('keeps the web framework out of the graph', async () => {
    const { metafile } = await bundled;
    const inputs = Object.keys(metafile.inputs);
    expect(inputs.filter((path) => /(^|\/)node_modules\/next\//.test(path))).toEqual([]);
    expect(inputs.filter((path) => /^src\/(server|app|ui)\//.test(path))).toEqual([]);
    expect(
      Object.values(metafile.inputs)
        .flatMap((input) => input.imports)
        .filter((record) => record.path === 'next' || record.path.startsWith('next/')),
    ).toEqual([]);
  });

  it('bundles pg-boss (no node_modules at run time) and leaves only the declared externals', async () => {
    const { metafile } = await bundled;
    const bare = new Set(
      Object.values(metafile.inputs)
        .flatMap((input) => input.imports)
        .filter(
          (record) =>
            record.external &&
            !record.path.startsWith('node:') &&
            !record.path.startsWith('<') &&
            !builtinModules.includes(record.path),
        )
        .map((record) => record.path),
    );
    expect([...bare].filter((path) => !['nodemailer', 'pg-native'].includes(path))).toEqual([]);
    expect(
      Object.keys(metafile.inputs).some((path) => path.includes('node_modules/pg-boss/')),
    ).toBe(true);
  });
});
