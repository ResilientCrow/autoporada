import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { composeDocument } from '@/document';
import { renderDocx } from '@/document/render-docx';

import { VARIANTS } from '../support/variants';
import { prettyXml } from '../support/xml';

/** The parts that decide how the document looks; docProps carry timestamps and are skipped. */
const PARTS = ['word/document.xml', 'word/numbering.xml', 'word/styles.xml', 'word/settings.xml'];

async function parts(docx: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(docx);
  const names = [
    ...PARTS,
    ...Object.keys(zip.files)
      .filter((f) => /^word\/footer\d+\.xml$/.test(f))
      .sort(),
  ];
  const out: Record<string, string> = {};
  for (const name of names) {
    const file = zip.file(name);
    if (file) out[name] = prettyXml(await file.async('string'));
  }
  return out;
}

describe.each(Object.keys(VARIANTS))('golden: %s', (name) => {
  const model = composeDocument(VARIANTS[name]!());

  it('composes the same model', async () => {
    await expect(`${JSON.stringify(model, null, 2)}\n`).toMatchFileSnapshot(
      `../golden/${name}/model.json`,
    );
  });

  it('renders the same DOCX parts', async () => {
    const rendered = await parts(await renderDocx(model));
    for (const [part, xml] of Object.entries(rendered)) {
      await expect(xml).toMatchFileSnapshot(`../golden/${name}/${part.replace('word/', '')}`);
    }
  });
});

describe('injection corpus', () => {
  it('keeps hostile text as text: no fields, hyperlinks or external targets', async () => {
    const zip = await JSZip.loadAsync(
      await renderDocx(composeDocument(VARIANTS['escape-hell']!())),
    );
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const rels = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';

    expect(document).toContain('&lt;script&gt;alert(„x“)&lt;/script&gt; &amp; ]]&gt;');
    expect(document).not.toMatch(/<w:fldSimple|<w:instrText|<w:fldChar|<w:hyperlink/);
    expect(rels).not.toMatch(/TargetMode="External"|evil\.example/);
    for (const name of Object.keys(zip.files).filter((f) => f.endsWith('.xml'))) {
      const xml = (await zip.file(name)?.async('string')) ?? '';
      // XML 1.0 forbids C0 controls except tab, LF and CR.
      expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    }
  });
});
