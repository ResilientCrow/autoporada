// @vitest-environment happy-dom
import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { importMessage, ImportError } from './messages';
import { importFile, placeImages, type ImportDeps } from './index';
import type { Block, Shrink } from './types';
import type { PdfLib } from './pdf';

const okShrink: Shrink = (raw) => Promise.resolve({ src: `data:image/jpeg;base64,${raw.base64}`, w: 10, h: 10 });
const img = (mime: string, base64 = 'AA'): Block => ({ k: 'image', raw: { mime, base64 }, alt: 'x' });

describe('placeImages', () => {
  it('shrinks the pictures it can carry and counts the others', async () => {
    const r = await placeImages([img('image/png'), img('image/svg+xml'), img('image/x-emf'), img('image/gif'), img('image/webp'), img('image/jpeg')], okShrink);
    expect(r.blocks.map((b) => b.k)).toEqual(['image', 'image', 'image', 'image']);
    expect(r.skipped).toBe(2);
  });
  it('counts a picture the browser cannot decode', async () => {
    const r = await placeImages([img('image/png')], () => Promise.resolve(null));
    expect(r).toEqual({ blocks: [], skipped: 1 });
  });
  it('counts a picture whose shrinking fails', async () => {
    const r = await placeImages([img('image/png')], () => Promise.reject(new Error('read')));
    expect(r.skipped).toBe(1);
  });
  it('keeps paragraphs and tables where they are', async () => {
    const blocks: Block[] = [{ k: 'p', indent: 0, text: 'a' }, img('image/png'), { k: 'table', rows: [['x']] }];
    expect((await placeImages(blocks, okShrink)).blocks.map((b) => b.k)).toEqual(['p', 'image', 'table']);
  });
  it('stops as too big once the pictures alone would not be saved', async () => {
    const big: Shrink = () => Promise.resolve({ src: 'x'.repeat(1_200_000), w: 10, h: 10 });
    await expect(placeImages([img('image/png'), img('image/png'), img('image/png')], big)).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
  });
});

const parser = new DOMParser();
const mm = { convertToHtml: (bytes: Uint8Array, o: unknown) => (mammoth as unknown as { convertToHtml(i: unknown, o: unknown): Promise<{ value: string }> }).convertToHtml({ buffer: Buffer.from(bytes) }, o), images: mammoth.images as never };
const pdfLib = (lines: string[]): PdfLib => ({ getDocument: () => ({ destroy: () => Promise.resolve(), promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve({ getTextContent: () => Promise.resolve({ items: lines.map((t, i) => ({ str: t, transform: [1, 0, 0, 1, 50, 800 - i * 14], width: 100, height: 11, hasEOL: true })) }) }) }) }) });
const deps = (over: Partial<ImportDeps> = {}): ImportDeps => ({ shrink: okShrink, mammoth: () => Promise.resolve(mm), pdf: () => Promise.resolve(pdfLib(['Ahoj světe'])), parser, convertDoc: () => Promise.reject(new Error('unused')), ...over });
const docx = async (...text: string[]) => new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: text.map((t) => new Paragraph(t)) }] })));

describe('importFile', () => {
  it('reads a .docx into parts', async () => {
    const r = await importFile(await docx('Jedna', 'Dvě'), { titleEmpty: false }, deps());
    expect(r.parts).toHaveLength(1);
    expect(r.textOnly).toBe(false);
  });

  it('reads a .pdf as text only', async () => {
    const r = await importFile(new TextEncoder().encode('%PDF-1.4 x'), { titleEmpty: false }, deps());
    expect(r).toMatchObject({ textOnly: true, skipped: 0 });
    expect(r.parts).toHaveLength(1);
  });

  it('converts a .doc to a PDF first and says text only', async () => {
    let got: Uint8Array | undefined;
    const r = await importFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { titleEmpty: false }, deps({ convertDoc: (b) => { got = b; return Promise.resolve(new TextEncoder().encode('%PDF-1.4')); } }));
    expect(got).toHaveLength(8);
    expect(r.textOnly).toBe(true);
  });

  it('says doc-failed when the converted PDF cannot be read', async () => {
    const bad: PdfLib = { getDocument: () => ({ destroy: () => Promise.resolve(), promise: Promise.reject(new Error('x')) }) };
    await expect(importFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { titleEmpty: false }, deps({ pdf: () => Promise.resolve(bad), convertDoc: () => Promise.resolve(new TextEncoder().encode('%PDF-1.4')) }))).rejects.toEqual(expect.objectContaining({ code: 'doc-failed' }));
  });

  it('passes the failure of the conversion on', async () => {
    await expect(importFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { titleEmpty: false }, deps({ convertDoc: () => Promise.reject(new ImportError('rate-limited', 30)) }))).rejects.toEqual(expect.objectContaining({ code: 'rate-limited', retryAfterSeconds: 30 }));
  });

  it('refuses a .doc over 10 000 000 bytes (the server cap) before sending it, and anything over 20 000 000', async () => {
    const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const doc = new Uint8Array(10_000_001); doc.set(OLE);
    let sent = 0;
    const convertDoc = (b: Uint8Array) => { sent = b.length; return Promise.resolve(new TextEncoder().encode('%PDF-1.4')); };
    await expect(importFile(doc, { titleEmpty: false }, deps({ convertDoc }))).rejects.toEqual(expect.objectContaining({ code: 'file-too-big' }));
    expect(sent).toBe(0);
    const edge = new Uint8Array(10_000_000); edge.set(OLE);
    await importFile(edge, { titleEmpty: false }, deps({ convertDoc }));
    expect(sent).toBe(10_000_000);
    await expect(importFile(new Uint8Array(20_000_001), { titleEmpty: false }, deps())).rejects.toEqual(expect.objectContaining({ code: 'file-too-big' }));
  });

  it('lets the signed-out and step-up answers of the conversion through, as they are', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(importFile(ole, { titleEmpty: false }, deps({ convertDoc: () => Promise.reject(new ImportError('signed-out')) }))).rejects.toEqual(expect.objectContaining({ code: 'signed-out' }));
  });

  it('passes a too-big converted PDF through as too-big, not as doc-failed', async () => {
    const huge: PdfLib = { getDocument: () => ({ destroy: () => Promise.resolve(), promise: Promise.resolve({ numPages: 5000, getPage: () => Promise.reject(new Error('no')) }) }) };
    await expect(importFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { titleEmpty: false }, deps({ pdf: () => Promise.resolve(huge), convertDoc: () => Promise.resolve(new TextEncoder().encode('%PDF-1.4')) }))).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
  });

  it('passes a lazy chunk that failed to load through as stale, for every format', async () => {
    const stale = () => Promise.reject(new ImportError('stale'));
    await expect(importFile(await docx('a'), { titleEmpty: false }, deps({ mammoth: stale }))).rejects.toEqual(expect.objectContaining({ code: 'stale' }));
    await expect(importFile(new TextEncoder().encode('%PDF-1.4'), { titleEmpty: false }, deps({ pdf: stale }))).rejects.toEqual(expect.objectContaining({ code: 'stale' }));
    await expect(importFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { titleEmpty: false }, deps({ pdf: stale, convertDoc: () => Promise.resolve(new TextEncoder().encode('%PDF-1.4')) }))).rejects.toEqual(expect.objectContaining({ code: 'stale' }));
  });

  it('counts the whole annex list against the save cap', async () => {
    const existingBytes = 3_449_900;
    await expect(importFile(await docx('x'.repeat(500)), { titleEmpty: false, existingBytes }, deps())).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
    await expect(importFile(await docx('x'.repeat(500)), { titleEmpty: false, existingBytes: 1000 }, deps())).resolves.toBeDefined();
  });

  it('says the pictures were skipped, not that there is no text, when a file held only pictures that could not be carried', async () => {
    const z = new JSZip(); z.file('mimetype', 'application/vnd.oasis.opendocument.text'); z.file('Pictures/a.svg', '<svg/>');
    z.file('content.xml', '<office:document-content xmlns:office="o" xmlns:text="t" xmlns:draw="d" xmlns:xlink="x"><office:body><office:text><text:p><draw:frame><draw:image xlink:href="Pictures/a.svg"/></draw:frame></text:p></office:text></office:body></office:document-content>');
    const err = await importFile(await z.generateAsync({ type: 'uint8array' }), { titleEmpty: false }, deps()).catch((e: unknown) => e);
    expect((err as ImportError).code).toBe('pictures-skipped');
    expect(importMessage(err as ImportError)).toBe('Některé obrázky jsme nepřenesli. Přidejte je jako obrázek zvlášť.');
    await expect(importFile(await docx(' '), { titleEmpty: false }, deps())).rejects.toEqual(expect.objectContaining({ code: 'empty' }));
  });

  it('says unknown for a file that is none of the formats', async () => {
    await expect(importFile(new TextEncoder().encode('just text'), { titleEmpty: false }, deps())).rejects.toEqual(expect.objectContaining({ code: 'unknown' }));
  });

  it('says empty when the file holds no text', async () => {
    await expect(importFile(await docx(' '), { titleEmpty: false }, deps())).rejects.toEqual(expect.objectContaining({ code: 'empty' }));
  });

  it('reads an .odt', async () => {
    const z = new JSZip(); z.file('mimetype', 'application/vnd.oasis.opendocument.text');
    z.file('content.xml', '<office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text><text:h>Název</text:h><text:p>Text</text:p></office:text></office:body></office:document-content>');
    const r = await importFile(await z.generateAsync({ type: 'uint8array' }), { titleEmpty: true }, deps());
    expect(r.title).toBe('Název');
    expect(r.parts).toHaveLength(1);
  });
});
