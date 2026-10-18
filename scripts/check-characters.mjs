// Source files must spell invisible and look-alike characters as escapes
// (for example the no-break space or Private Use Area bullet glyphs): raw ones are unreadable in editors and diffs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED = /\.(ts|tsx|css|mjs|json)$/;
const DIRS = ['src', 'test/support', 'scripts'];

/** NBSP, zero-width and bidi format characters, line separators, BOM, private use, noncharacters, C0 controls. */
function invisible(cp) {
  return (
    cp === 0x00a0 ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff ||
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    cp === 0xfffe ||
    cp === 0xffff ||
    (cp < 0x20 && cp !== 0x0a && cp !== 0x09 && cp !== 0x0d)
  );
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (SCANNED.test(name)) yield path;
  }
}

const problems = [];
for (const dir of DIRS) {
  for (const path of files(join(ROOT, dir))) {
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const ch of line) {
          const cp = ch.codePointAt(0) ?? 0;
          if (invisible(cp)) {
            const hex = cp.toString(16).toUpperCase().padStart(4, '0');
            problems.push(`${relative(ROOT, path)}:${i + 1}  raw U+${hex}, write it as an escape`);
          }
        }
      });
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
