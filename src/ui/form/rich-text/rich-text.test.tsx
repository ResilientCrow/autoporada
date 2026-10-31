import { getSchema } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { Italic } from '@tiptap/extension-italic';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import fc from 'fast-check';
import type { FormEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  emptyRichDoc,
  LIMITS,
  parseRichDoc,
  richDocFromText,
  type Indent,
  type RichDoc,
  type RichParagraph,
  type RichText,
} from '@/domain/richtext';
import { richtext } from '@/ui/copy';
import { Form, type FormSpec, type FormState } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';
import { DocMarkup } from './doc-markup';
import { Indentation } from './indent';
import { RichTextField } from './RichTextField';

const doc: RichDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { indent: 2 },
      content: [
        { type: 'text', text: 'plain ' },
        { type: 'text', text: 'strong', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'slanted', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'both', marks: [{ type: 'bold' }, { type: 'italic' }] },
      ],
    },
    { type: 'paragraph', attrs: { indent: 0 } },
  ],
};

describe('DocMarkup', () => {
  const html = renderToStaticMarkup(<DocMarkup doc={doc} />);

  it('renders each paragraph with its level as a class and data-indent, never a style', () => {
    expect(html).toContain('<p class="rt-p rt-l2" data-indent="2">');
    expect(html).toContain('<p class="rt-p rt-l0" data-indent="0"><br/></p>');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('wraps bold in strong and italic in em, both as strong around em', () => {
    expect(html).toContain('<span>plain </span>');
    expect(html).toContain('<span><strong>strong</strong></span>');
    expect(html).toContain('<span><em>slanted</em></span>');
    expect(html).toContain('<span><strong><em>both</em></strong></span>');
  });

  it('escapes the text', () => {
    const out = renderToStaticMarkup(<DocMarkup doc={richDocFromText('<b onclick="x">&</b>')} />);
    expect(out).toContain('&lt;b onclick=&quot;x&quot;&gt;&amp;&lt;/b&gt;');
    expect(out).not.toContain('<b ');
  });

  it('renders nothing for a document without paragraphs', () => {
    expect(renderToStaticMarkup(<DocMarkup doc={emptyRichDoc()} />)).toBe('');
  });
});

describe('RichTextField on the server (ADR 0031)', () => {
  const spec: FormSpec = { body: { label: 'Text bodu', required: true } };
  const state: FormState = {
    issues: null,
    problem: null,
    attempt: 0,
    submitting: null,
    onSubmit: (event: FormEvent<HTMLFormElement>) => event.preventDefault(),
  };
  const render = (profile: 'outline' | 'paragraphs', value: RichDoc = doc) =>
    renderToStaticMarkup(
      <Form id="f" spec={spec} state={state}>
        <RichTextField
          name="body"
          profile={profile}
          defaultValue={value}
          maxBytes={LIMITS.maxBytes}
        />
      </Form>,
    );

  it('puts the stored text in a static element and mounts the editor on a separate, empty, hidden one', () => {
    const html = render('outline');
    expect(html).toMatch(
      /<div class="rt-box"><div hidden=""><\/div><div id="f-body"[^>]*class="rt-static">/,
    );
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<p class="rt-p rt-l2" data-indent="2">');
  });

  it('has no style attribute and clean markup', () => {
    for (const profile of ['outline', 'paragraphs'] as const) {
      const html = render(profile);
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    }
  });

  it('carries the document as JSON in a hidden input named after the field', () => {
    const html = render('outline');
    const match = /<input type="hidden" name="body" value="([^"]*)"\/>/.exec(html);
    expect(match).not.toBeNull();
    const json = match![1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    expect(JSON.parse(json)).toEqual(doc);
  });

  it('labels the field, links help and counter, and says which profile explains levels', () => {
    const outline = render('outline');
    expect(outline).toContain('Text bodu');
    expect(outline).toContain(richtext.help);
    expect(outline).toContain(richtext.toolbar.indent);
    const plain = render('paragraphs');
    expect(plain).toContain(richtext.helpPlain);
    expect(plain).not.toContain(richtext.toolbar.indent);
    expect(outline).toMatch(/Využito \d+(&nbsp;|\u00a0)% místa/);
  });

  it('warns in bold once the text takes 90 percent of the room', () => {
    const big = richDocFromText('x'.repeat(100));
    const html = renderToStaticMarkup(
      <Form id="f" spec={spec} state={state}>
        <RichTextField name="body" profile="paragraphs" defaultValue={big} maxBytes={120} />
      </Form>,
    );
    expect(html).toContain(
      richtext.counterNear(
        Math.round((new TextEncoder().encode(JSON.stringify(big)).length / 120) * 100),
      ),
    );
  });
});

// The editor itself needs a DOM, and there is none in the node environment; what can be checked
// without one is that every stored document is one the editor's schema accepts and gives back.
describe('the stored document and the editor schema', () => {
  const schema = getSchema([Document, Paragraph, Text, Bold, Italic, Indentation]);

  const indent = fc.constantFrom<Indent>(0, 1, 2, 3);
  const text = fc
    .string({ minLength: 1, maxLength: 12, unit: 'grapheme-ascii' })
    .filter((s) => s.trim() !== '');
  const marks = fc.constantFrom<RichText['marks']>(
    undefined,
    [{ type: 'bold' }],
    [{ type: 'italic' }],
    [{ type: 'bold' }, { type: 'italic' }],
  );
  // ProseMirror joins neighbouring runs with the same marks, as the editor does.
  const differentNeighbours = (runs: RichText[]) =>
    runs.every((r, i) => i === 0 || JSON.stringify(r.marks) !== JSON.stringify(runs[i - 1]!.marks));
  const run = fc
    .record({ text, marks })
    .map(({ text: t, marks: m }): RichText => ({ type: 'text', text: t, ...(m && { marks: m }) }));
  const paragraph = fc
    .record({ indent, runs: fc.array(run, { maxLength: 4 }).filter(differentNeighbours) })
    .map(({ indent: i, runs }): RichParagraph => ({
      type: 'paragraph',
      attrs: { indent: i },
      ...(runs.length > 0 && { content: runs }),
    }));
  const generated = fc
    .array(paragraph, { minLength: 1, maxLength: 5 })
    .map((content): RichDoc => ({ type: 'doc', content }));

  it('takes 50 generated documents through parseRichDoc, the schema and back unchanged', () => {
    const docs = fc.sample(generated, { numRuns: 50, seed: 7 });
    expect(docs).toHaveLength(50);
    for (const original of docs) {
      const parsed = parseRichDoc(JSON.parse(JSON.stringify(original)), 'outline');
      expect(parsed.ok).toBe(true);
      const node = schema.nodeFromJSON(original);
      node.check();
      expect(node.toJSON()).toEqual(original);
    }
  });

  it('gives the indent attribute a default of 0 and keeps the levels', () => {
    const node = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(node.firstChild?.attrs['indent']).toBe(0);
  });
});
