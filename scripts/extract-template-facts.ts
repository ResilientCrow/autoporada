// Usage: node scripts/extract-template-facts.ts <template.docx>
// Writes test/fixtures/template/format-facts.json: the formatting facts the
// generated document must match. The template itself is not committed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { extractFacts } from '../test/support/docx-facts.ts';

const OUT = 'test/fixtures/template/format-facts.json';
const args = process.argv.slice(2);
const templatePath = args.find((a) => !a.startsWith('--'));
if (!templatePath) {
  console.error('Usage: node scripts/extract-template-facts.ts <template.docx> [--force]');
  process.exit(1);
}
const bytes = readFileSync(templatePath);
const sha = createHash('sha256').update(bytes).digest('hex');
const previous = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, 'utf8')) as { templateSha256?: string })
  : {};
if (previous.templateSha256 && previous.templateSha256 !== sha && !args.includes('--force')) {
  console.error(
    `This is a different template (${sha}). Pass --force to switch, then update TEMPLATE_SHA256 in src/document/render-docx/styles.ts.`,
  );
  process.exit(1);
}
const facts = await extractFacts(bytes);
const out = {
  source: 'porada vedení 12. 10. 2026.docx (blank template from the headmaster)',
  templateSha256: sha,
  facts,
};
// Bullet glyphs are Private Use Area characters (Symbol/Wingdings); escape them so they are visible.
const json = JSON.stringify(out, null, 2).replace(
  /[\uE000-\uF8FF]/g,
  (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase()}`,
);
writeFileSync(OUT, `${json}\n`);
console.log(`wrote ${OUT}`);
