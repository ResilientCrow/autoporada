/** Client components and React Aria stay where ADR 0012 puts them. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const USE_CLIENT = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/;
const IMPORTS_ARIA = /from\s+['"]react-aria-components(?:\/[^'"]*)?['"]/;
const IMPORTS_CS = /import\s*\{[^}]*\bcs\b[^}]*\}\s*from\s*['"]@\/ui\/copy['"]/;
const EXPORT_NAME =
  /^export\s+(?:default\b|(?:async\s+)?(?:function|const|class|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*))/gm;
const ALLOWED_EXPORT = /^(?:[A-Z][A-Za-z0-9]*|use[A-Z]\w*)$/;

function isClient(text: string): boolean {
  return USE_CLIENT.test(text);
}

/** The problems of one file, as short reasons. */
function boundaryProblems(text: string): string[] {
  const problems: string[] = [];
  const client = isClient(text);
  if (IMPORTS_ARIA.test(text) && !client) problems.push("React Aria without 'use client'");
  if (client) {
    const bad = [...text.matchAll(EXPORT_NAME)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined && !ALLOWED_EXPORT.test(name));
    if (bad.length > 0) problems.push(`client file exports ${bad.join(', ')}`);
    if (IMPORTS_CS.test(text)) problems.push('client file imports cs; use an area object');
  }
  return problems;
}

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('boundaryProblems', () => {
  it.each([
    ["import { Button } from 'react-aria-components/Button';", ["React Aria without 'use client'"]],
    [
      "'use client';\nexport const helper = 1;\nexport function Ok() {}",
      ['client file exports helper'],
    ],
    [
      "'use client';\nimport { cs } from '@/ui/copy';",
      ['client file imports cs; use an area object'],
    ],
    ["'use client';\nimport { appError } from '@/ui/copy';\nexport default function X() {}", []],
    [
      "'use client';\nimport { Button } from 'react-aria-components/Button';\nexport function Button2() {}\nexport function useThing() {}",
      [],
    ],
    ["import { cs } from '@/ui/copy';\nexport const x = cs;", []],
  ])('%#', (text, expected) => {
    expect(boundaryProblems(text)).toEqual(expected);
  });
});

describe('the source tree', () => {
  it('keeps React Aria and copy out of the wrong client files', () => {
    const found = [...walk('src/ui'), ...walk('src/app')].flatMap((file) =>
      boundaryProblems(readFileSync(join(ROOT, file), 'utf8')).map((p) => `${file}: ${p}`),
    );
    expect(found).toEqual([]);
  });
});
