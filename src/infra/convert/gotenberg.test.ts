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

  it('never runs inside a transaction', async () => {
    const { calls, fetch } = answering(async () => new Response(PDF));
    const converter = createGotenbergConverter({ url: 'http://g', fetch });

    await expect(inTransactionScope(() => converter.docxToPdf(DOCX))).rejects.toThrow(
      'convert must not run inside a database transaction',
    );
    expect(calls).toHaveLength(0);
  });
});
