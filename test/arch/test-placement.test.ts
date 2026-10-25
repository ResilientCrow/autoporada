import { readdirSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

import { configDefaults } from 'vitest/config';
import { describe, expect, it } from 'vitest';

import config from '../../vitest.config.mts';

const ROOT = process.cwd();
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
/** Playwright runs `.spec` files from here (playwright.config.ts `testDir`). */
const E2E_DIR = 'test/e2e/';

/** Every `src` and `test` file that looks like a test (it also walks the folders Vitest excludes), as a posix path from the root. */
function testFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...testFiles(path));
    } else if (TEST_FILE.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

/** What each Vitest project runs, read from vitest.config.mts so the two cannot drift. */
const projects = (config.test?.projects ?? []).map((project) => {
  if (typeof project !== 'object' || !('test' in project)) throw new Error('unexpected project');
  const rootExclude = config.test?.exclude ?? configDefaults.exclude;
  const { name, include = [], exclude = rootExclude } = project.test ?? {};
  return { name: String(name), include, exclude };
});

const runsIn = (file: string) =>
  projects
    .filter(
      (p) =>
        p.include.some((glob) => matchesGlob(file, glob)) &&
        !p.exclude.some((glob) => matchesGlob(file, glob)),
    )
    .map((p) => p.name);

describe('test placement', () => {
  const files = [...testFiles('src'), ...testFiles('test')].sort();

  it('reads the projects and finds the tests', () => {
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.include.length > 0)).toBe(true);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.startsWith(E2E_DIR) && f.endsWith('.spec.ts'))).toBe(true);
  });

  // The matcher itself, on made-up paths: the repo's own files cannot show a wrong glob or a dropped exclude.
  it('maps paths to projects', () => {
    expect(runsIn('test/unit/x.test.ts')).toEqual([]);
    expect(runsIn('src/node_modules/x.test.ts')).toEqual([]);
    expect(runsIn('src/a/b.test.tsx')).toEqual(['unit']);
    expect(runsIn('src/application/use-cases/x/y.test.ts')).toEqual(['unit', 'integration']);
  });

  // passWithNoTests is on, so a test no project includes is skipped without a word.
  it('runs every Vitest test file in some project', () => {
    const orphans = files.filter((f) => !f.startsWith(E2E_DIR) && runsIn(f).length === 0);
    expect(orphans).toEqual([]);
  });

  it('keeps Playwright specs in test/e2e, and only there', () => {
    const misplaced = files.filter((f) => f.startsWith(E2E_DIR) !== /\.spec\.[cm]?tsx?$/.test(f));
    expect(misplaced).toEqual([]);
  });
});
