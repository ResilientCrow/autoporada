import { describe, expect, it } from 'vitest';
import { readPdf, type PdfLib } from './pdf';

/** A one-page PDF with Helvetica text, built by hand so no fixture file is needed. `lines` are [y, text]. */
function pdf(lines: [number, string][]): Uint8Array {
  const stream = lines.map(([y, t]) => `BT /F1 12 Tf 50 ${y} Td (${t.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe('readPdf with the real pdf.js', () => {
  it('reads lines and paragraphs of a real PDF', async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib;
    const r = await readPdf(pdf([[800, 'First line of one'], [786, 'paragraph.'], [740, '- a bullet']]), lib);
    expect(r.blocks).toEqual([{ k: 'p', indent: 0, text: 'First line of one paragraph.' }, { k: 'p', indent: 1, text: 'a bullet' }]);
  });

  it('says broken for bytes that are no PDF', async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib;
    await expect(readPdf(new TextEncoder().encode('%PDF-1.4 garbage'), lib)).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });
});
