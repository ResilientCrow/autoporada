import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { detectFormat } from './detect';

const zip = async (files: Record<string, string>) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return z.generateAsync({ type: 'uint8array' }); };
const ascii = (s: string) => new TextEncoder().encode(s);

describe('detectFormat', () => {
  it('knows a .docx by word/document.xml, whatever the name', async () => {
    expect(await detectFormat(await zip({ 'word/document.xml': '<w/>', '[Content_Types].xml': '<x/>' }))).toBe('docx');
  });
  it('knows an .odt by its mimetype entry, and an .ott template too', async () => {
    expect(await detectFormat(await zip({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': '<x/>' }))).toBe('odt');
    expect(await detectFormat(await zip({ mimetype: 'application/vnd.oasis.opendocument.text-template' }))).toBe('odt');
  });
  it('does not take another OpenDocument type or another zip for text', async () => {
    expect(await detectFormat(await zip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet' }))).toBe('unknown');
    expect(await detectFormat(await zip({ 'a.txt': 'x' }))).toBe('unknown');
    expect(await detectFormat(await zip({ 'xl/workbook.xml': '<x/>' }))).toBe('unknown');
  });
  it('refuses a zip that would inflate beyond the cap, before it inflates anything', async () => {
    const z = new JSZip(); z.file('word/document.xml', new Uint8Array(31_000_000));
    const bomb = await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(200_000);
    await expect(detectFormat(bomb)).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
  });
  it('reads the mimetype entry only when it is tiny', async () => {
    const z = new JSZip(); z.file('mimetype', 'application/vnd.oasis.opendocument.text' + ' '.repeat(100_000));
    const loaded = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const proto = Object.getPrototypeOf(loaded.file('mimetype')!) as { async: () => unknown };
    const spy = vi.spyOn(proto, 'async');
    expect(await detectFormat(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))).toBe('unknown');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('knows a PDF by its header, which may follow a few bytes of junk', async () => {
    expect(await detectFormat(ascii('%PDF-1.7\n...'))).toBe('pdf');
    expect(await detectFormat(ascii('\n\n  %PDF-1.4'))).toBe('pdf');
  });
  it('knows a .doc by the OLE header', async () => {
    expect(await detectFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe('doc');
  });
  it('says unknown for text, an image, empty bytes and a broken zip', async () => {
    expect(await detectFormat(ascii('Ahoj'))).toBe('unknown');
    expect(await detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('unknown');
    expect(await detectFormat(new Uint8Array())).toBe('unknown');
    expect(await detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe('unknown');
  });
});
