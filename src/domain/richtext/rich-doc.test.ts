import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  exceedsLimits,
  isRichDocEmpty,
  LIMITS,
  paragraphRuns,
  parseRichDoc,
  richDocFromText,
  richDocToPlainText,
  singleLine,
  type RichDoc,
} from './index';

const outline: RichDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { indent: 1 },
      content: [
        { type: 'text', text: 'parkování na dvoře', marks: [{ type: 'bold' }, { type: 'italic' }] },
      ],
    },
    {
      type: 'paragraph',
      attrs: { indent: 3 },
      content: [
        { type: 'text', text: 'kontakt: ' },
        { type: 'text', text: 'správa', marks: [{ type: 'bold' }] },
      ],
    },
    { type: 'paragraph', attrs: { indent: 0 } },
  ],
};

/** Characters the validator refuses: controls except tab, surrogates, non-characters. */
const INVALID_TEXT =
  /[\u0000-\u0008\u000A-\u001F\u007F-\u009F\u2028\u2029\uD800-\uDFFF\uFFFE\uFFFF]/;

const errorsOf = (input: unknown, profile: 'paragraphs' | 'outline' = 'outline') => {
  const result = parseRichDoc(input, profile);
  return result.ok ? [] : result.errors;
};

describe('parseRichDoc', () => {
  it('accepts an outline with skipped levels and normalises it', () => {
    expect(parseRichDoc(outline, 'outline')).toEqual({ ok: true, doc: outline });
  });

  it('fills in a missing indent and sorts duplicate marks away', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'italic' }, { type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    expect(parseRichDoc(input, 'paragraphs')).toEqual({
      ok: true,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 0 },
            content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }],
          },
        ],
      },
    });
  });

  it('keeps report bodies to plain paragraphs', () => {
    expect(errorsOf(outline, 'paragraphs')).toEqual([
      'doc.content[0].attrs.indent: must be an integer 0–0',
      'doc.content[1].attrs.indent: must be an integer 0–0',
    ]);
  });

  it.each([
    [
      { type: 'doc', content: [{ type: 'heading', content: [] }] },
      'doc.content[0]: expected a paragraph',
    ],
    [
      { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 4 } }] },
      'doc.content[0].attrs.indent: must be an integer 0–3',
    ],
    [
      { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 1.5 } }] },
      'doc.content[0].attrs.indent: must be an integer 0–3',
    ],
    [
      { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0, class: 'x' } }] },
      'doc.content[0].attrs: unexpected "class"',
    ],
    [
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
      'doc.content[0].content[0]: text must be a non-empty string',
    ],
    [
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'a',
                marks: [{ type: 'link', attrs: { href: 'javascript:x' } }],
              },
            ],
          },
        ],
      },
      'doc.content[0].content[0].marks[0]: only bold and italic are allowed',
    ],
    [
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'a', marks: [{ type: 'bold', attrs: {} }] }],
          },
        ],
      },
      'doc.content[0].content[0].marks[0]: unexpected "attrs"',
    ],
    [
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\nb' }] }] },
      'doc.content[0].content[0]: text contains control characters',
    ],
    [
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\u0000' }] }],
      },
      'doc.content[0].content[0]: text contains control characters',
    ],
    [
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '\uD800' }] }],
      },
      'doc.content[0].content[0]: text contains control characters',
    ],
    [{ type: 'doc', content: [], html: '<b>x</b>' }, 'doc: unexpected "html"'],
    [
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', src: 'x' }] }] },
      'doc.content[0].content[0]: expected a text node',
    ],
  ])('rejects %j', (input, error) => {
    expect(errorsOf(input)).toContain(error);
  });

  it.each([null, 'doc', [], { type: 'paragraph' }, { type: 'doc', content: {} }])(
    'rejects non-documents: %j',
    (input) => {
      expect(parseRichDoc(input, 'outline').ok).toBe(false);
    },
  );

  it('allows tabs inside text', () => {
    expect(
      errorsOf({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\tb' }] }],
      }),
    ).toEqual([]);
  });

  it('enforces the size and node limits', () => {
    const huge = richDocFromText('x'.repeat(LIMITS.maxBytes));
    expect(errorsOf(huge)).toEqual(['document is larger than 64 KB']);
    const many = {
      type: 'doc',
      content: Array.from({ length: LIMITS.maxNodes + 1 }, () => ({ type: 'paragraph' })),
    };
    expect(errorsOf(many)).toEqual(['document has more than 2000 nodes']);
  });

  it('never throws, whatever it is given (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 5 }), (input) => {
        expect(() => parseRichDoc(input, 'outline')).not.toThrow();
      }),
    );
  });

  it('accepts every well-formed document and normalises it idempotently (property)', () => {
    const text = fc.string({ minLength: 1 }).filter((t) => !INVALID_TEXT.test(t));
    const mark = fc.constantFrom({ type: 'bold' }, { type: 'italic' });
    const docs = fc.record({
      type: fc.constant('doc'),
      content: fc.array(
        fc.record({
          type: fc.constant('paragraph'),
          attrs: fc.record({ indent: fc.integer({ min: 0, max: 3 }) }),
          content: fc.array(
            fc.record({ type: fc.constant('text'), text, marks: fc.array(mark, { maxLength: 3 }) }),
            { maxLength: 3 },
          ),
        }),
        { maxLength: 5 },
      ),
    });
    fc.assert(
      fc.property(docs, (input) => {
        const result = parseRichDoc(input, 'outline');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(parseRichDoc(result.doc, 'outline')).toEqual(result);
        expect(richDocToPlainText(result.doc)).toBe(richDocToPlainText(input as RichDoc));
      }),
    );
  });

  it('returns a result for input JSON cannot represent', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 20_000; i++) deep = [deep];
    const cyclic: Record<string, unknown> = { type: 'doc' };
    cyclic['content'] = cyclic;
    for (const input of [
      { type: 'doc', content: [], x: deep },
      cyclic,
      { type: 'doc', content: [], n: 10n },
    ]) {
      expect(parseRichDoc(input, 'outline')).toEqual({
        ok: false,
        errors: ['document is not valid rich text'],
      });
    }
  });

  it('accepts only plain objects', () => {
    class Doc {
      type = 'doc';
      content = [];
    }
    expect(parseRichDoc(new Doc(), 'outline').ok).toBe(false);
  });
});

describe('helpers', () => {
  it('splits plain text on every kind of line break', () => {
    expect(richDocFromText('a\rb\u2028c\r\nd').content).toHaveLength(4);
    expect(parseRichDoc(richDocFromText('a\rb'), 'outline').ok).toBe(true);
  });

  it('converts plain text to paragraphs and back', () => {
    const doc = richDocFromText('první\n\ndruhý');
    expect(doc.content).toHaveLength(3);
    expect(richDocToPlainText(doc)).toBe('první\n\ndruhý');
    expect(isRichDocEmpty(richDocFromText('  \n '))).toBe(true);
  });

  it('turns a paragraph into renderer runs', () => {
    expect(
      paragraphRuns(outline.content[1] ?? { type: 'paragraph', attrs: { indent: 0 } }),
    ).toEqual([{ text: 'kontakt: ' }, { text: 'správa', bold: true }]);
  });
});

describe('exceedsLimits', () => {
  const texts = (n: number): RichDoc => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { indent: 0 },
        content: Array.from({ length: n }, () => ({ type: 'text' as const, text: 'a' })),
      },
    ],
  });
  const bytes = (doc: RichDoc) => new TextEncoder().encode(JSON.stringify(doc)).length;
  /** One paragraph of `ž` (two bytes each) padded with `a` to exactly `size` bytes. */
  const sized = (size: number): RichDoc => {
    const empty = bytes(richDocFromText('x')) - 1;
    const rest = size - empty;
    return richDocFromText('ž'.repeat(Math.floor(rest / 2)) + 'a'.repeat(rest % 2));
  };

  it('passes a document with exactly the most nodes', () => {
    expect(exceedsLimits(texts(LIMITS.maxNodes - 1))).toBe(false);
  });

  it('refuses one node more', () => {
    expect(exceedsLimits(texts(LIMITS.maxNodes))).toBe(true);
  });

  it('passes a document of exactly the most bytes', () => {
    const doc = sized(LIMITS.maxBytes);
    expect(bytes(doc)).toBe(LIMITS.maxBytes);
    expect(exceedsLimits(doc)).toBe(false);
  });

  it('refuses one byte more', () => {
    expect(exceedsLimits(sized(LIMITS.maxBytes + 1))).toBe(true);
  });

  it('agrees with parseRichDoc on both limits', () => {
    for (const doc of [texts(1998), texts(1999), texts(2000), sized(LIMITS.maxBytes + 1)]) {
      expect(exceedsLimits(doc)).toBe(!parseRichDoc(doc, 'paragraphs').ok);
    }
  });
});

describe('singleLine', () => {
  it.each([
    ['a\nb', 'a b'],
    ['a\r\nb', 'a b'],
    ['a\tb', 'a b'],
    ['a \n \t \n b', 'a b'],
    ['  a\n\n\nb  ', 'a b'],
    ['\ta\t', 'a'],
    ['a  b', 'a  b'],
    ['\n \t', ''],
    ['', ''],
    ['a\u00a0b', 'a\u00a0b'],
  ])('turns %j into %j', (input, expected) => {
    expect(singleLine(input)).toBe(expected);
  });
});
