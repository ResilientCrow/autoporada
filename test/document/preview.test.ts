import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { composeDocument } from '@/document';
import { PaperBlocks, PaperPreview } from '@/document/render-html';

import { VARIANTS } from '../support/variants';
import { prettyXml } from '../support/xml';

const render = (name: string) =>
  renderToStaticMarkup(
    createElement(PaperPreview, {
      model: composeDocument(VARIANTS[name]!()),
      label: 'Náhled porady',
    }),
  );

describe('paper preview', () => {
  it.each(['template-replica', 'lean', 'annex2'])('renders %s like the golden', async (name) => {
    await expect(prettyXml(render(name))).toMatchFileSnapshot(`../golden/${name}/preview.html`);
  });

  it('shows the same point numbers as the document', () => {
    const numbers = [...render('template-replica').matchAll(/>(\d+)\)\.</g)].map((m) =>
      Number(m[1]),
    );
    expect(numbers).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it('escapes hostile text', () => {
    const html = render('escape-hell');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('previews a few blocks on their own, for the live form preview', () => {
    const html = renderToStaticMarkup(
      createElement(PaperBlocks, {
        blocks: [
          { kind: 'point', number: 15, text: 'Seminář Matika Česku' },
          {
            kind: 'reportLine',
            label: 'účast studentů:',
            runs: [{ text: ' pan Jan Novák (2.A)' }],
          },
        ],
      }),
    );
    expect(html).not.toContain('<article');
    expect(html).toContain('15).');
    expect(html).toContain('<b><i>- účast studentů:</i></b>');
  });

  it('marks new students in the Příloha 1 table', () => {
    expect(render('template-replica')).toMatch(
      /<tr class="[^"]*new[^"]*"><td>Joe Dohn<\/td><td>1\.A<\/td><\/tr>/,
    );
  });
});
