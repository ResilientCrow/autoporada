import type { Indent } from '@/domain/richtext';

/** A picture as the file holds it, before it is shrunk. */
export interface RawImage { mime: string; base64: string }
interface ShrunkImage { src: string; w: number; h: number }
/** What a reader finds, in document order. A heading is a paragraph that only the title rule treats apart. */
export type Block =
  | { k: 'p'; indent: Indent; text: string; heading?: true }
  | { k: 'table'; rows: string[][] }
  | { k: 'image'; raw: RawImage; alt: string };
/** A block after its picture was shrunk. */
export type PlacedBlock = Exclude<Block, { k: 'image' }> | ({ k: 'image'; alt: string } & ShrunkImage);
/** Re-encodes a picture to a JPEG data URL (canvas in the browser); null when it cannot be decoded. */
export type Shrink = (raw: RawImage) => Promise<ShrunkImage | null>;
/** What a reader finds: blocks, the pictures it could not carry (EMF, WMF, SVG, ...), and whether only text could be read. */
export interface Read { blocks: Block[]; skipped: number; textOnly: boolean }
