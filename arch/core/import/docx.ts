import JSZip from 'jszip';
import { ImportError } from './messages';
import { assertZipSize } from './zipguard';
import { HtmlReader } from './html';
import type { Read, RawImage } from './types';

const TITLE_STYLE = ["p[style-name='Title'] => h1:fresh"];

/** The part of mammoth this reader uses; `index.ts` loads the real one lazily. */
export interface MammothLib {
  convertToHtml(bytes: Uint8Array, options: { convertImage: unknown; styleMap: string[] }): Promise<{ value: string }>;
  images: { imgElement(f: (image: { contentType: string; readAsBase64String(): Promise<string> }) => Promise<{ src: string }>): unknown };
}

/** Parses an HTML string; the browser's `DOMParser`, or the test environment's. */
export type HtmlParser = Pick<DOMParser, 'parseFromString'>;

/** Reads blocks from HTML text. */
export function htmlToBlocks(html: string, images: ReadonlyMap<string, RawImage>, parser: HtmlParser): Read {
  const reader = new HtmlReader(images);
  reader.children(parser.parseFromString(html, 'text/html').body.childNodes);
  return { blocks: reader.blocks, skipped: reader.skipped, textOnly: false };
}

/** A .docx through mammoth: paragraphs, headings, lists, tables and pictures; marks, fonts and colours are not carried. */
export async function readDocx(bytes: Uint8Array, mammoth: MammothLib, parser: HtmlParser): Promise<Read> {
  const images = new Map<string, RawImage>();
  try {
    assertZipSize(await JSZip.loadAsync(bytes)); // mammoth inflates the zip itself; look at the sizes first
    const convertImage = mammoth.images.imgElement(async (image) => {
      const id = `img-${images.size}`;
      images.set(id, { mime: image.contentType, base64: await image.readAsBase64String() });
      return { src: id };
    });
    // Word's Title style is the document's name; mammoth maps it to no heading by itself.
    const { value } = await mammoth.convertToHtml(bytes, { convertImage, styleMap: TITLE_STYLE });
    return htmlToBlocks(value, images, parser);
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('broken', undefined, { cause: e });
  }
}
