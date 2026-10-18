// Enforces the colour manual in source code:
//  - colours are defined once, as tokens in src/ui/theme/;
//  - "Primární – Print" (#004D8C) is for print only and never appears in the app.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const THEME_DIR = join('src', 'ui', 'theme') + sep;
const SCANNED = /\.(ts|tsx|css|mjs)$/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const PRINT_ONLY = /004d8c/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (SCANNED.test(name)) yield path;
  }
}

const problems = [];
for (const path of files(SRC)) {
  const rel = relative(ROOT, path);
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (PRINT_ONLY.test(line)) {
        problems.push(`${rel}:${i + 1}  #004D8C is a print-only colour`);
      } else if (!rel.startsWith(THEME_DIR) && HEX.test(line)) {
        problems.push(`${rel}:${i + 1}  hex colour outside src/ui/theme — use a token`);
      }
      HEX.lastIndex = 0;
    });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
