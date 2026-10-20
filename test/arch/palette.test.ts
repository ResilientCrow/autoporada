import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { manualColours, paletteProblems } from '../../scripts/palette-rules';

const ROOT = process.cwd();
const THEME = readFileSync(join(ROOT, 'src/ui/theme/theme.css'), 'utf8');
const MANUAL = manualColours(THEME);

const TSX = 'src/ui/kit/Card.tsx';
const THEME_FILE = 'src/ui/theme/theme.css';

function problems(file: string, text: string): string[] {
  return paletteProblems(file, text, MANUAL);
}

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('manualColours', () => {
  it('reads the seven tokens of the real theme', () => {
    expect([...MANUAL].sort()).toEqual(
      ['#22232a', '#000e19', '#00233f', '#0062b3', '#cce8ff', '#f7fbff', '#f5b800'].sort(),
    );
  });
});

describe('rules a and b: hex colours', () => {
  it.each([
    [TSX, 'const c = "#004D8C";', '#004D8C is a print-only colour'],
    ['src/ui/theme/index.ts', 'x = "#004d8c"', '#004D8C is a print-only colour'],
    ['src/ui/kit/Card.test.tsx', 'x = "#004D8C"', '#004D8C is a print-only colour'],
    [TSX, 'const c = "#fff";', 'hex colour outside src/ui/theme'],
    ['src/ui/kit/Card.test.tsx', 'const c = "#123456";', 'hex colour outside src/ui/theme'],
    [THEME_FILE, '--color-x: #123456;', '#123456 is not in the colour manual'],
  ])('%s: %s is refused', (file, text, reason) => {
    expect(problems(file, text)).toEqual([expect.stringContaining(reason)]);
  });

  it.each([
    [THEME_FILE, 'a { color: #22232A; }'],
    [TSX, 'const issue = "#42 of 10";'],
  ])('%s: %s passes', (file, text) => {
    expect(problems(file, text)).toEqual([]);
  });

  it('reports the line number', () => {
    expect(problems(TSX, 'a\nb #fff')).toEqual([
      `${TSX}:2  hex colour outside src/ui/theme — use a token`,
    ]);
  });
});

describe('rules c to i', () => {
  it.each([
    [TSX, 'rgb(0 0 0)', 'colour function'],
    ['src/document/render-html/paper.module.css', 'a { color: oklch(1 0 0); }', 'colour function'],
    [TSX, 'x = color-mix(in srgb, a, b)', 'colour function'],
    [TSX, 'className="bg-[red]"', 'arbitrary value'],
    [TSX, 'className="bg-[red]/50"', 'arbitrary value'],
    [TSX, 'className="!bg-[red]"', 'arbitrary value'],
    [TSX, 'className="hover:bg-[red]"', 'arbitrary value'],
    [TSX, 'className="bg-(color:--x)"', 'arbitrary value'],
    [TSX, 'className="text-(--x)"', 'arbitrary value'],
    [TSX, 'className="min-h-[44px]"', 'arbitrary value'],
    [TSX, 'className="[color:red]"', 'arbitrary property'],
    [TSX, 'className="hover:[background:blue]"', 'arbitrary property'],
    [TSX, 'className="[--tw-x:red]"', 'arbitrary property'],
    [TSX, 'className="bg-white"', 'default palette'],
    [TSX, 'className="text-red-500"', 'default palette'],
    [TSX, 'className="ring-offset-white"', 'default palette'],
    [TSX, 'className="border-slate-950/50"', 'default palette'],
    [TSX, 'className="text-accent"', 'StatusChip background only'],
    [TSX, 'className="focus:ring-accent"', 'StatusChip background only'],
    [TSX, 'className="bg-accent"', 'bg-accent is for'],
    [TSX, 'className="outline-none"', 'outline'],
    [TSX, 'className="focus:outline-hidden"', 'outline'],
    [TSX, '<path fill="red" />', 'SVG paint'],
    [TSX, '<path stroke="red" />', 'SVG paint'],
  ])('%s: %s is refused', (file, text, reason) => {
    expect(problems(file, text)).toEqual([expect.stringContaining(reason)]);
  });

  it.each([
    [TSX, 'className="data-[type=day]:bg-light"'],
    [TSX, 'className="aria-[current=page]:underline"'],
    [TSX, 'className="group-data-[selected]:bg-sublight"'],
    [TSX, 'className="bg-sublight text-ink border-digital rounded-brand p-4"'],
    [TSX, 'className="bg-navy-mid/50"'],
    [TSX, 'type Map = { [key: string]: number };'],
    [TSX, 'const re = /[a-z:]+/;'],
    [TSX, 'const first = items[0];'],
    [TSX, 'const total = (a - b) * count;'],
    [TSX, '<path fill="currentColor" stroke="none" />'],
    [TSX, '<path stroke="inherit" />'],
    [TSX, 'className="outline-2 outline-offset-2"'],
    ['src/ui/kit/StatusChip.tsx', 'className="bg-accent text-ink"'],
    ['src/ui/theme/theme.css', 'a { color: rgb(0 0 0); }'],
    ['src/ui/kit/Card.test.tsx', 'className="bg-[red] bg-accent outline-none rgb(0 0 0)"'],
    ['scripts/x.mjs', 'const a = "bg-[red]";'],
  ])('%s: %s passes', (file, text) => {
    expect(problems(file, text)).toEqual([]);
  });

  it('skips tests for the class rules but not the hex rules', () => {
    expect(problems('src/ui/kit/Card.test.tsx', 'bg-[red] #fff')).toHaveLength(1);
  });
});

describe('rule j: stray stylesheets', () => {
  it.each([
    ['src/ui/theme/theme.css', true],
    ['src/document/render-html/paper.module.css', true],
    ['src/ui/kit/kit.css', false],
    ['src/app/globals.css', false],
  ])('%s allowed: %s', (file, allowed) => {
    expect(problems(file, 'a { color: black; }').length === 0).toBe(allowed);
  });
});

describe('the source tree', () => {
  it('is clean', () => {
    const found = walk('src').flatMap((file) =>
      paletteProblems(file, readFileSync(join(ROOT, file), 'utf8'), MANUAL),
    );
    expect(found).toEqual([]);
  });
});
