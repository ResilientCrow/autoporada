import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { composeDocument } from '@/document';
import { renderDocx, TEMPLATE_SHA256 } from '@/document/render-docx';

import { extractFacts } from '../support/docx-facts';
import { snapshotFixture } from '../support/snapshots';

const template = JSON.parse(
  readFileSync(new URL('../fixtures/template/format-facts.json', import.meta.url), 'utf8'),
) as { templateSha256: string; facts: Awaited<ReturnType<typeof extractFacts>> };

describe('template parity', () => {
  it('is built against the template the facts come from', () => {
    expect(TEMPLATE_SHA256).toBe(template.templateSha256);
  });

  it('formats the generated replica exactly like the school template', async () => {
    const docx = await renderDocx(composeDocument(snapshotFixture('template-replica')));
    expect(await extractFacts(docx)).toEqual(template.facts);
  });
});
