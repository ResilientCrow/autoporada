import { describe, expect, it } from 'vitest';

import { prettyXml } from './xml';

describe('prettyXml', () => {
  it('keeps whitespace-only and no-break-space text', () => {
    const xml =
      '<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>\u00A0</w:t></w:r></w:p>';
    const pretty = prettyXml(xml);
    expect(pretty).toContain('<w:t xml:space="preserve"> </w:t>');
    expect(pretty).toContain('<w:t>\u00A0</w:t>');
  });

  it('indents nested elements and keeps text on its element’s line', () => {
    expect(prettyXml('<a><b>text</b><c/></a>')).toBe('<a>\n  <b>text</b>\n  <c/>\n</a>\n');
  });

  it('round-trips the text content', () => {
    const xml = '<a><b>x y</b><c> </c><d><e>z</e></d></a>';
    expect(prettyXml(xml).replace(/\n\s*/g, '')).toBe(xml);
  });
});
