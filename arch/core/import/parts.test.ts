import { describe, expect, it } from 'vitest';
import { exceedsLimits, richDocToPlainText, type RichDoc } from '@/domain/richtext';
import { ImportError } from './messages';
import { ANNEXES_MAX_BYTES } from '@/domain/report';
import { listBytes } from './apply';
import { IMPORT_LIMIT, toParts, type PartDraft } from './parts';
import type { PlacedBlock } from './types';

const p = (text: string, indent: 0 | 1 | 2 | 3 = 0, heading?: true): PlacedBlock => ({ k: 'p', indent, text, ...(heading && { heading }) });
const textOf = (part: PartDraft | undefined) => richDocToPlainText((part as { doc: RichDoc }).doc);

describe('toParts', () => {
  it('turns a run of paragraphs into one text part with their indents', () => {
    const r = toParts([p('Úvod'), p('Jedna', 1), p('Podbod', 2)], { titleEmpty: false });
    expect(r.title).toBeNull();
    expect(r.parts).toHaveLength(1);
    const doc = (r.parts[0] as { doc: RichDoc }).doc;
    expect(doc.content.map((c) => c.attrs.indent)).toEqual([0, 1, 2]);
    expect(textOf(r.parts[0])).toBe('Úvod\nJedna\nPodbod');
  });

  it('keeps document order across text, table and image', () => {
    const r = toParts([p('Před'), { k: 'table', rows: [['a', 'b'], ['1', '2']] }, { k: 'image', alt: '', src: 'data:image/jpeg;base64,AA', w: 10, h: 10 }, p('Po')], { titleEmpty: false });
    expect(r.parts.map((x) => x.kind)).toEqual(['text', 'table', 'image', 'text']);
  });

  it('drops empty paragraphs and empty table rows, and folds whitespace in cells', () => {
    const r = toParts([p('  '), p('A    B'), { k: 'table', rows: [[' x ', ''], ['', ' '], ['y\n z', '2']] }], { titleEmpty: false });
    expect(textOf(r.parts[0])).toBe('A B');
    expect(r.parts[1]).toMatchObject({ kind: 'table', rows: [['x', ''], ['y z', '2']] });
  });

  it('drops a table with no content at all', () => {
    expect(() => toParts([{ k: 'table', rows: [['', ''], [' ']] }], { titleEmpty: false })).toThrowError(expect.objectContaining({ code: 'empty' }));
  });

  it('uses a leading heading as the title when the annex has none, and does not repeat it', () => {
    const r = toParts([p('Výsledky voleb', 0, true), p('Text')], { titleEmpty: true });
    expect(r.title).toBe('Výsledky voleb');
    expect(textOf(r.parts[0])).toBe('Text');
  });

  it('leaves the title alone when the annex already has one, and prints the heading', () => {
    const r = toParts([p('Výsledky voleb', 0, true), p('Text')], { titleEmpty: false });
    expect(r.title).toBeNull();
    expect(textOf(r.parts[0])).toBe('Výsledky voleb\nText');
  });

  it('does not take a heading that is not first, or a plain first paragraph', () => {
    expect(toParts([p('Text'), p('H', 0, true)], { titleEmpty: true }).title).toBeNull();
    expect(toParts([p('Text jako první'), p('Další')], { titleEmpty: true }).title).toBeNull();
  });

  it('does not take a heading that is too long to be a title', () => {
    const long = 'x'.repeat(200);
    const r = toParts([p(long, 0, true), p('Text')], { titleEmpty: true });
    expect(r.title).toBeNull();
    expect(textOf(r.parts[0])).toContain(long);
  });

  it('refuses a file with only a title', () => {
    expect(() => toParts([p('Jen nadpis', 0, true)], { titleEmpty: true })).toThrowError(ImportError);
  });

  it('splits long text so every part stays inside the rich text limits', () => {
    const blocks = Array.from({ length: 1000 }, (_, i) => p(`Odstavec číslo ${i} ${'slovo '.repeat(20)}`));
    const r = toParts(blocks, { titleEmpty: false });
    expect(r.parts.length).toBeGreaterThan(2);
    for (const part of r.parts) {
      const doc = (part as { doc: RichDoc }).doc;
      expect(doc.content.length).toBeLessThanOrEqual(400);
      expect(exceedsLimits(doc)).toBe(false);
      expect(JSON.stringify(doc).length).toBeLessThanOrEqual(40_000);
    }
    expect(r.parts.map(textOf).join('\n').split('\n')).toHaveLength(1000);
  });

  it('cuts one enormous paragraph on spaces', () => {
    const r = toParts([p('slovo '.repeat(5000))], { titleEmpty: false });
    for (const part of r.parts) expect(exceedsLimits((part as { doc: RichDoc }).doc)).toBe(false);
    expect(r.parts.map(textOf).join(' ').replace(/\s+/g, ' ').trim().split(' ')).toHaveLength(5000);
  });

  it('never cuts a surrogate pair when it must cut a long spaceless run', () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const r = toParts([p(`a${'😀'.repeat(5000)}`)], { titleEmpty: false });
    const texts = r.parts.map(textOf).join('\n').split('\n');
    expect(texts.length).toBeGreaterThan(1);
    for (const t of texts) expect(lone.test(t)).toBe(false);
    expect(texts.join('')).toBe(`a${'😀'.repeat(5000)}`);
  });

  it('says empty for nothing', () => {
    expect(() => toParts([p(' ')], { titleEmpty: false })).toThrowError(expect.objectContaining({ code: 'empty' }));
  });

  it('refuses what would not fit the annex save, counting what the annex already holds', () => {
    const big = 'A'.repeat(2_000_000);
    const img = (): PlacedBlock => ({ k: 'image', alt: '', src: `data:image/jpeg;base64,${big}`, w: 10, h: 10 });
    expect(() => toParts([img(), img()], { titleEmpty: false })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(() => toParts([img()], { titleEmpty: false, existingBytes: 1_500_000 })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(toParts([img()], { titleEmpty: false }).parts).toHaveLength(1);
  });

  it('counts the whole annex list as it will be saved, against the save cap less a margin', () => {
    expect(IMPORT_LIMIT).toBeLessThan(ANNEXES_MAX_BYTES);
    expect(IMPORT_LIMIT).toBeGreaterThan(ANNEXES_MAX_BYTES - 200_000);
    const sibling = { id: 'annex-1', title: 'Velká', parts: [{ id: 'part-1', kind: 'text', doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'x'.repeat(IMPORT_LIMIT - 2_000) }] }] } }] };
    const target = { id: 'annex-2', title: '', parts: [] };
    const existingBytes = listBytes([sibling, target], target);
    expect(existingBytes).toBeGreaterThan(IMPORT_LIMIT - 2_100);
    expect(() => toParts([p('x'.repeat(5_000))], { titleEmpty: false, existingBytes })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(toParts([p('malý')], { titleEmpty: false, existingBytes }).parts).toHaveLength(1);
  });

  it('counts the ids the editor gives the new parts', () => {
    const table = (): PlacedBlock => ({ k: 'table', rows: [['a']] });
    const blocks = [p('x'), table(), p('y'), table(), p('z')];
    const bare = JSON.stringify(toParts(blocks, { titleEmpty: false }).parts).length;
    expect(() => toParts(blocks, { titleEmpty: false, existingBytes: IMPORT_LIMIT - bare - 10 })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(toParts(blocks, { titleEmpty: false, existingBytes: IMPORT_LIMIT - bare - 400 }).parts).toHaveLength(5);
  });

  it('counts the title a heading gives the annex', () => {
    const blocks = [p('T'.repeat(140), 0, true), p('Text')];
    const bare = JSON.stringify(toParts(blocks, { titleEmpty: true }).parts).length;
    expect(toParts([p('Text')], { titleEmpty: true, existingBytes: IMPORT_LIMIT - bare - 140 }).parts).toHaveLength(1);
    expect(() => toParts(blocks, { titleEmpty: true, existingBytes: IMPORT_LIMIT - bare - 140 })).toThrowError(expect.objectContaining({ code: 'too-big' }));
  });

  it('caps indent at 3', () => {
    const r = toParts([p('a', 3)], { titleEmpty: false });
    expect((r.parts[0] as { doc: RichDoc }).doc.content[0]!.attrs.indent).toBe(3);
  });
});
