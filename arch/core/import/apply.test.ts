import { describe, expect, it } from 'vitest';
import { richDocToPlainText, type RichDoc } from '@/domain/richtext';
import type { Annex } from '../types';
import { appendImported } from './apply';
import type { Imported } from './parts';

const text = (t: string): Imported['parts'][number] => ({ kind: 'text', doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: t }] }] } });
const ids = () => { let n = 0; return () => `p${++n}`; };
const annex = (title: string): Annex => ({ id: 'a1', title, parts: [{ id: 'old', kind: 'text', doc: { type: 'doc', content: [] } }] });

describe('appendImported', () => {
  it('appends the parts with fresh ids and names an untitled annex after the heading it took', () => {
    const r = appendImported(annex(''), { title: 'Výsledky', parts: [text('a'), { kind: 'table', rows: [['x']] }] }, ids());
    expect(r.title).toBe('Výsledky');
    expect(r.parts.map((p) => p.id)).toEqual(['old', 'p1', 'p2']);
  });

  it('keeps the title the person typed while the file was read, and puts the heading back as the first paragraph', () => {
    const r = appendImported(annex('Moje'), { title: 'Výsledky', parts: [text('a')] }, ids());
    expect(r.title).toBe('Moje');
    expect(r.parts.map((p) => p.kind)).toEqual(['text', 'text', 'text']);
    expect(richDocToPlainText((r.parts[1] as { doc: RichDoc }).doc)).toBe('Výsledky');
    expect(richDocToPlainText((r.parts[2] as { doc: RichDoc }).doc)).toBe('a');
  });

  it('changes no title when the file gave none', () => {
    expect(appendImported(annex(''), { title: null, parts: [text('a')] }, ids()).title).toBe('');
    expect(appendImported(annex('Moje'), { title: null, parts: [text('a')] }, ids()).parts).toHaveLength(2);
  });

  it('treats a title of white space as none', () => {
    expect(appendImported(annex('  '), { title: 'Výsledky', parts: [text('a')] }, ids()).title).toBe('Výsledky');
  });
});
