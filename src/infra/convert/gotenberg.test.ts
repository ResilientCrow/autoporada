import { describe, expect, it } from 'vitest';

import { inTransactionScope } from '@/infra/system';

import { createGotenbergConverter, type ConvertFetch } from './gotenberg';

const DOCX = new Uint8Array([0x50, 0x4b, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.7 the porada');

const answering = (response: () => Promise<Response>) => {
  const calls: { url: string; file: File }[] = [];
  const fetch: ConvertFetch = async (url, init) => {
    calls.push({ url, file: init.body.get('files') as File });
    return response();
  };
  return { calls, fetch };
};

describe('the Gotenberg converter', () => {
  it('posts the DOCX as porada.docx and gives the PDF back', async () => {
    const { calls, fetch } = answering(async () => new Response(PDF));
    const converter = createGotenbergConverter({ url: 'http://gotenberg:3000', fetch });

    await expect(converter.docxToPdf(DOCX)).resolves.toEqual({ ok: true, pdf: PDF });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://gotenberg:3000/forms/libreoffice/convert');
    expect(calls[0]?.file.name).toBe('porada.docx');
    expect(new Uint8Array(await calls[0]!.file.arrayBuffer())).toEqual(DOCX);
  });

  it('posts a .doc as annex.doc, so LibreOffice picks the Word importer', async () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
    const { calls, fetch } = answering(async () => new Response(PDF));
    const converter = createGotenbergConverter({ url: 'http://gotenberg:3000', fetch });

    await expect(converter.docToPdf(doc)).resolves.toEqual({ ok: true, pdf: PDF });
    expect(calls[0]?.url).toBe('http://gotenberg:3000/forms/libreoffice/convert');
    expect(calls[0]?.file.name).toBe('annex.doc');
    expect(new Uint8Array(await calls[0]!.file.arrayBuffer())).toEqual(doc);
  });

  it('gives a .doc the same codes: error answer, not a PDF, unreachable', async () => {
    const doc = new Uint8Array([1]);
    const codeOf = (fetch: ConvertFetch) =>
      createGotenbergConverter({ url: 'http://g', fetch }).docToPdf(doc);
    await expect(codeOf(async () => new Response('no', { status: 500 }))).resolves.toEqual({
      ok: false,
      code: 'convert.http.500',
    });
    await expect(codeOf(async () => new Response('<html>'))).resolves.toEqual({
      ok: false,
      code: 'convert.not-pdf',
    });
    await expect(codeOf(() => Promise.reject(new TypeError('x')))).resolves.toEqual({
      ok: false,
      code: 'convert.unavailable',
    });
  });

  it('gives a code, never the text, for an error answer', async () => {
    const { fetch } = answering(async () => new Response('LibreOffice said no', { status: 503 }));
    const converter = createGotenbergConverter({ url: 'http://g', fetch });

    await expect(converter.docxToPdf(DOCX)).resolves.toEqual({
      ok: false,
      code: 'convert.http.503',
    });
  });

  it('refuses an answer that is not a PDF', async () => {
    const { fetch } = answering(async () => new Response('<html>'));
    const converter = createGotenbergConverter({ url: 'http://g', fetch });

    await expect(converter.docxToPdf(DOCX)).resolves.toEqual({
      ok: false,
      code: 'convert.not-pdf',
    });
  });

  it('tells a timeout from an unreachable converter', async () => {
    const hanging: ConvertFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      );
    const down: ConvertFetch = () => Promise.reject(new TypeError('fetch failed'));

    await expect(
      createGotenbergConverter({ url: 'http://g', fetch: hanging, budgetMs: 5 }).docxToPdf(DOCX),
    ).resolves.toEqual({ ok: false, code: 'convert.timeout' });
    await expect(
      createGotenbergConverter({ url: 'http://g', fetch: down }).docxToPdf(DOCX),
    ).resolves.toEqual({ ok: false, code: 'convert.unavailable' });
  });

  it('takes a redirect as a failed answer and does not follow it', async () => {
    const seen: string[] = [];
    const fetch: ConvertFetch = async (url, init) => {
      seen.push(`${url} ${init.redirect}`);
      return new Response(null, { status: 307, headers: { Location: 'https://elsewhere.test/' } });
    };
    const converter = createGotenbergConverter({ url: 'http://g', fetch });

    await expect(converter.docxToPdf(DOCX)).resolves.toEqual({
      ok: false,
      code: 'convert.http.307',
    });
    expect(seen).toEqual(['http://g/forms/libreoffice/convert manual']);
  });

  it('refuses an answer past the size limit, by its length or while it streams', async () => {
    const declared = answering(
      async () => new Response(PDF, { headers: { 'Content-Length': String(64) } }),
    );
    let pulled = 0;
    const endless = answering(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled += 1;
              controller.enqueue(pulled === 1 ? PDF : new Uint8Array(16));
            },
          }),
        ),
    );
    const capped = (fetch: ConvertFetch) =>
      createGotenbergConverter({ url: 'http://g', fetch, maxBytes: PDF.length + 8 });

    await expect(capped(declared.fetch).docxToPdf(DOCX)).resolves.toEqual({
      ok: false,
      code: 'convert.too-large',
    });
    await expect(capped(endless.fetch).docxToPdf(DOCX)).resolves.toEqual({
      ok: false,
      code: 'convert.too-large',
    });
    expect(pulled).toBeLessThan(5);
    await expect(
      createGotenbergConverter({
        url: 'http://g',
        fetch: answering(async () => new Response(PDF)).fetch,
        maxBytes: PDF.length,
      }).docxToPdf(DOCX),
    ).resolves.toEqual({ ok: true, pdf: PDF });
  });

  it('never runs inside a transaction', async () => {
    const { calls, fetch } = answering(async () => new Response(PDF));
    const converter = createGotenbergConverter({ url: 'http://g', fetch });

    await expect(inTransactionScope(() => converter.docxToPdf(DOCX))).rejects.toThrow(
      'convert must not run inside a database transaction',
    );
    expect(calls).toHaveLength(0);
  });
});
