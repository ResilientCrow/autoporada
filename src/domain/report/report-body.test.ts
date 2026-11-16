import { describe, expect, it } from 'vitest';

import { emptyRichDoc, richDocFromText, type RichDoc } from '@/domain/richtext';

import { reportBody } from './index';

const texts = (doc: ReturnType<typeof reportBody>) =>
  doc.content.map((p) => p.content?.map((t) => t.text).join('') ?? '');

describe('reportBody', () => {
  it('continues the opening’s last line with the body’s first paragraph, one paragraph per line', () => {
    const body = reportBody('První věta.\nDruhá věta.', richDocFromText('Text.\nDalší.'));
    expect(texts(body)).toEqual(['První věta.', 'Druhá věta. Text.', 'Další.']);
  });

  it('trims the opening and the start of the body', () => {
    expect(texts(reportBody('  \n Věta. \t ', richDocFromText('  Text.')))).toEqual([
      'Věta. Text.',
    ]);
  });

  it('keeps the marks of the body’s first paragraph', () => {
    const bold = { type: 'text', text: 'Tučně', marks: [{ type: 'bold' }] } as const;
    const body: RichDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [bold] }],
    };
    expect(reportBody('Věta.', body).content).toEqual([
      {
        type: 'paragraph',
        attrs: { indent: 0 },
        content: [{ type: 'text', text: 'Věta. ' }, bold],
      },
    ]);
  });

  it('starts a new paragraph when the body opens with an empty one', () => {
    expect(texts(reportBody('Věta.', richDocFromText('\nText.')))).toEqual(['Věta.', '', 'Text.']);
  });

  it.each(['', '   ', '\t\n'])('leaves the body as it is for a blank opening (%j)', (opening) => {
    const body = richDocFromText('Text.\nVíc.');
    expect(reportBody(opening, body)).toEqual(body);
  });

  it('gives only the opening for an empty body', () => {
    expect(texts(reportBody('Věta.', emptyRichDoc()))).toEqual(['Věta.']);
  });

  it('keeps the body’s later paragraphs untouched', () => {
    const body = richDocFromText('A\nB\nC');
    expect(reportBody('Věta.', body).content.slice(1)).toEqual(body.content.slice(1));
  });
});
