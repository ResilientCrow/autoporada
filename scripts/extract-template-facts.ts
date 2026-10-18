// Usage: node scripts/extract-template-facts.ts <template.docx>
// Writes test/fixtures/template/format-facts.json: the formatting facts the
// generated document must match. The template itself is not committed.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { extractFacts } from '../test/support/docx-facts.ts';

const [templatePath] = process.argv.slice(2);
if (!templatePath) {
  console.error('Usage: node scripts/extract-template-facts.ts <template.docx>');
  process.exit(1);
}
const bytes = readFileSync(templatePath);
const facts = await extractFacts(bytes);
const out = {
  source: 'porada vedení 12. 10. 2026.docx (blank template from the headmaster)',
  templateSha256: createHash('sha256').update(bytes).digest('hex'),
  facts,
};
// Bullet glyphs are Private Use Area characters (Symbol/Wingdings); escape them so they are visible.
const json = JSON.stringify(out, null, 2).replace(
  /[\uE000-\uF8FF]/g,
  (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase()}`,
);
writeFileSync('test/fixtures/template/format-facts.json', `${json}\n`);
console.log('wrote test/fixtures/template/format-facts.json');
