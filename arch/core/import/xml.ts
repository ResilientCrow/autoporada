import type JSZip from 'jszip';
import type { HtmlParser } from './docx';

/** A zip entry as text; null when there is none. */
export async function entryText(zip: JSZip, name: string): Promise<string | null> {
  const f = zip.file(name);
  return f ? new TextDecoder().decode(await f.async('uint8array')) : null;
}

/**
 * Parses XML; a document that does not parse throws, and the reader turns that into `broken`. A spreadsheet's XML never
 * has a DOCTYPE, so one is refused before the parser could expand its entities.
 */
export function parseXml(parser: HtmlParser, text: string): Document {
  if (/<!DOCTYPE/i.test(text)) throw new Error('doctype');
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  return doc;
}

/** Elements by local name, whatever prefix the writer chose (by name, since not every DOM matches a `*` namespace). */
export const all = (root: Document | Element, local: string): Element[] => Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === local);
export const kids = (e: Element, local: string): Element[] => Array.from(e.children).filter((c) => c.localName === local);
