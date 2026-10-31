import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { parseRichDoc } from '@/domain/richtext';

import { docOf } from './editor';

const para = (...texts: string[]): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { indent: 0 },
      content: texts.map((text) => ({ type: 'text', text })),
    },
  ],
});

describe('docOf: editor JSON to the stored shape', () => {
  it('keeps plain text and marks', () => {
    const json: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { indent: 1 },
          content: [{ type: 'text', text: 'a', marks: [{ type: 'italic' }, { type: 'bold' }] }],
        },
      ],
    };
    expect(docOf(json, 3).content[0]).toEqual({
      type: 'paragraph',
      attrs: { indent: 1 },
      content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'italic' }] }],
    });
  });

  it.each([
    ['left-to-right mark', 'a\u200eb'],
    ['right-to-left mark', 'a\u200fb'],
    ['line separator', 'a\u2028b'],
    ['paragraph separator', 'a\u2029b'],
    ['vertical tab', 'a\u000bb'],
    ['C1 control', 'a\u0085b'],
    ['bidi override', 'a\u202eb'],
    ['NUL', 'a\u0000b'],
    ['lone surrogate', 'a\ud800b'],
  ])('strips a %s so the save is not refused', (_name, text) => {
    const doc = docOf(para(text), 3);
    expect(doc.content[0]?.content).toEqual([{ type: 'text', text: 'ab' }]);
    expect(parseRichDoc(doc, 'outline').ok).toBe(true);
  });

  it('turns a pasted newline into a space and keeps tabs', () => {
    const doc = docOf(para('a\nb\tc'), 3);
    expect(doc.content[0]?.content).toEqual([{ type: 'text', text: 'a b\tc' }]);
  });

  it('drops a run that is empty once stripped', () => {
    const doc = docOf(para('\u200e', 'x'), 3);
    expect(doc.content[0]?.content).toEqual([{ type: 'text', text: 'x' }]);
    expect(docOf(para('\u200e'), 3).content[0]).toEqual({
      type: 'paragraph',
      attrs: { indent: 0 },
    });
  });
});
