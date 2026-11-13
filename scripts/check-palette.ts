// Enforces the colour manual and the Tailwind rules in source code (rules: palette-rules.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manualColours, paletteProblems } from './palette-rules';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED = /\.(ts|tsx|css|mjs)$/;

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* files(path);
    else if (SCANNED.test(entry.name)) yield path;
  }
}

// The Next theme is gone with the classic UI, so the manual is empty until this check is removed.
const THEME = join(ROOT, 'src/ui/theme/theme.css');
const manual = manualColours(existsSync(THEME) ? readFileSync(THEME, 'utf8') : '');
const problems = [...files('src')].flatMap((file) =>
  paletteProblems(file, readFileSync(join(ROOT, file), 'utf8'), manual),
);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
