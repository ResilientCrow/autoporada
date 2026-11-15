import { shrinkToJpeg } from '../image';
import { loadChunk } from './chunk';
import { convertDocWith } from './convert';
import type { ImportDeps } from './index';
import type { PdfLib } from './pdf';

/** The importer's dependencies in the browser. mammoth and pdf.js load only here, when a file is picked. */
export const browserDeps = (): ImportDeps => ({
  shrink: (raw) => shrinkToJpeg(`data:${raw.mime};base64,${raw.base64}`).catch(() => null),
  mammoth: async () => {
    const m = (await loadChunk(() => import('mammoth'))) as unknown as { default?: unknown };
    const lib = (m.default ?? m) as { convertToHtml(i: unknown, o: unknown): Promise<{ value: string }>; images: unknown };
    return {
      convertToHtml: (bytes, options) => lib.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, options),
      images: lib.images as never,
    };
  },
  pdf: async () => {
    const lib = await loadChunk(() => import('pdfjs-dist'));
    lib.GlobalWorkerOptions.workerSrc = '/arch/pdf.worker.min.mjs';
    return lib as unknown as PdfLib;
  },
  parser: new DOMParser(),
  convertDoc: (bytes) => convertDocWith(fetch.bind(globalThis), bytes),
});
