import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP = join(process.cwd(), 'src/app');
/** optionalSignedIn renders for anyone, so only this call is a guard. */
const GUARDED = /\brequireSignedIn\(/;
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

/**
 * Pages that need no sign-in check, each reviewed on purpose: the sign-in page
 * itself, the gallery (404 in production), the privacy notice (it adapts to a
 * signed-in viewer but is for everyone) and the 404 page. Adding a path here
 * widens the anonymous surface, so the edit shows in review.
 */
const OPEN = new Set([
  'prihlaseni/page.tsx',
  'vzornik/page.tsx',
  'ochrana-osobnich-udaju/page.tsx',
  'not-found.tsx',
]);

/** The pages that neither check the viewer nor are on the reviewed list. */
function unguarded(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([path, text]) => !OPEN.has(path) && !GUARDED.test(text.replace(COMMENTS, '')))
    .map(([path]) => path);
}

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === 'page.tsx' || entry.name === 'not-found.tsx' ? [path] : [];
  });
}

describe('unguarded', () => {
  it('flags a page that neither checks the viewer nor is reviewed', () => {
    expect(unguarded({ 'geheim/page.tsx': 'export default function P() {}' })).toEqual([
      'geheim/page.tsx',
    ]);
  });

  it('accepts a checked page and a reviewed one', () => {
    expect(
      unguarded({
        'a/page.tsx': 'const v = await requireSignedIn("/a");',
        'vzornik/page.tsx': '',
      }),
    ).toEqual([]);
  });

  it('counts only requireSignedIn: optionalSignedIn renders for anyone', () => {
    expect(unguarded({ 'b/page.tsx': 'const v = await optionalSignedIn();' })).toEqual([
      'b/page.tsx',
    ]);
  });

  it('ignores a call that is only in a comment', () => {
    expect(
      unguarded({
        'c/page.tsx': '// requireSignedIn(\nexport default function P() {}',
        'd/page.tsx': '/* await requireSignedIn("/d") */\nexport default function P() {}',
      }),
    ).toEqual(['c/page.tsx', 'd/page.tsx']);
  });
});

describe('pages', () => {
  it('check who is looking, or are on the reviewed list', () => {
    const files = Object.fromEntries(
      pageFiles(APP).map((path) => [relative(APP, path), readFileSync(path, 'utf8')]),
    );
    expect(Object.keys(files).length).toBeGreaterThan(OPEN.size);
    expect(unguarded(files)).toEqual([]);
  });
});
