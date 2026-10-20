import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP = join(process.cwd(), 'src/app');
const GUARDED = /\b(?:requireSignedIn|optionalSignedIn)\(/;

/**
 * Pages that need no sign-in check, each reviewed on purpose: the sign-in page
 * itself, the gallery (404 in production) and the 404 page. Adding a path here
 * widens the anonymous surface, so the edit shows in review.
 */
const OPEN = new Set(['prihlaseni/page.tsx', 'vzornik/page.tsx', 'not-found.tsx']);

/** The pages that neither check the viewer nor are on the reviewed list. */
function unguarded(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([path, text]) => !OPEN.has(path) && !GUARDED.test(text))
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
        'a/page.tsx': 'const v = await optionalSignedIn();',
        'vzornik/page.tsx': '',
      }),
    ).toEqual([]);
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
