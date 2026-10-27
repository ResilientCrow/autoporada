import { describe, expect, it } from 'vitest';

import { emptyRichDoc, richDocFromText } from '@/domain/richtext';

import { reportBody } from './index';

const texts = (doc: ReturnType<typeof reportBody>) =>
  doc.content.map((p) => p.content?.map((t) => t.text).join('') ?? '');

describe('reportBody', () => {
  it('puts the opening before the body, one paragraph per line', () => {
    const body = reportBody('První věta.\nDruhá věta.', richDocFromText('Text.'));
    expect(texts(body)).toEqual(['První věta.', 'Druhá věta.', 'Text.']);
  });

  it('trims the opening', () => {
    expect(texts(reportBody('  \n Věta. \t ', richDocFromText('Text.')))).toEqual([
      'Věta.',
      'Text.',
    ]);
  });

  it.each(['', '   ', '\t\n'])('leaves the body as it is for a blank opening (%j)', (opening) => {
    const body = richDocFromText('Text.\nVíc.');
    expect(reportBody(opening, body)).toEqual(body);
  });

  it('gives only the opening for an empty body', () => {
    expect(texts(reportBody('Věta.', emptyRichDoc()))).toEqual(['Věta.']);
  });

  it('keeps the body’s paragraphs untouched', () => {
    const body = richDocFromText('A\nB');
    expect(reportBody('Věta.', body).content.slice(1)).toEqual(body.content);
  });
});
