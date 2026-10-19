/** The source tree as the inventory tests see it. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ACTION_MODULE, ROUTE_FILE, scanSource, type ScanResult } from './scan';

const ROOT = process.cwd();
const SOURCE = /\.(?:ts|tsx|mts)$/;

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every source file under src/, as a path relative to the repository root. */
export const SOURCE_FILES: readonly string[] = walk('src').sort();

export const SCANNED: readonly ScanResult[] = SOURCE_FILES.map((file) =>
  scanSource(file, readFileSync(join(ROOT, file), 'utf8')),
);

export const ACTION_MODULES = SOURCE_FILES.filter((f) => ACTION_MODULE.test(f));
export const ROUTE_FILES = SOURCE_FILES.filter((f) => ROUTE_FILE.test(f));

/** Use-case modules: everything under use-cases/ except the registry and tests. */
export const USE_CASE_MODULES = SOURCE_FILES.filter(
  (f) =>
    f.startsWith('src/application/use-cases/') &&
    f !== 'src/application/use-cases/index.ts' &&
    !f.endsWith('.test.ts'),
);

export const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** A module's exports, loaded the way Next would load it. */
export async function exportsOf(file: string): Promise<Readonly<Record<string, unknown>>> {
  return (await import(relative(import.meta.dirname, join(ROOT, file)))) as Record<string, unknown>;
}
