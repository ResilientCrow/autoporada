/**
 * Restricted rich text (ADR 0007), stored as ProseMirror-compatible JSON: a
 * flat list of paragraphs, each with an indent level, containing text with
 * bold and italic only. Levels 1–3 are the template's „o“ / „o“ / „■“ bullets.
 */
export type Indent = 0 | 1 | 2 | 3;
export type Mark = 'bold' | 'italic';

export interface RichText {
  readonly type: 'text';
  readonly text: string;
  readonly marks?: readonly { readonly type: Mark }[];
}

export interface RichParagraph {
  readonly type: 'paragraph';
  readonly attrs: { readonly indent: Indent };
  readonly content?: readonly RichText[];
}

export interface RichDoc {
  readonly type: 'doc';
  readonly content: readonly RichParagraph[];
}

/** Where a document is used decides how deep it may go. */
export type RichProfile =
  /** Report point bodies: plain paragraphs. */
  | 'paragraphs'
  /** POKYNY items and Příloha 2: all three bullet levels. */
  | 'outline';

export const LIMITS = { maxBytes: 64 * 1024, maxNodes: 2000 } as const;

export function emptyRichDoc(): RichDoc {
  return { type: 'doc', content: [] };
}

/** One paragraph per line; for seeds and plain-text fallbacks. */
export function richDocFromText(text: string, indent: Indent = 0): RichDoc {
  const lines = text.split(/\r\n|[\r\n\u0085\u2028\u2029]/).map((line) => line.trim());
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      attrs: { indent },
      ...(line && { content: [{ type: 'text', text: line }] }),
    })),
  };
}

export function richDocToPlainText(doc: RichDoc): string {
  return doc.content.map((p) => (p.content ?? []).map((t) => t.text).join('')).join('\n');
}

export function isRichDocEmpty(doc: RichDoc): boolean {
  return richDocToPlainText(doc).trim() === '';
}

export interface Run {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

/** The runs of one paragraph, as the document renderers consume them. */
export function paragraphRuns(p: RichParagraph): Run[] {
  return (p.content ?? []).map((t) => {
    const marks = new Set(t.marks?.map((m) => m.type));
    return {
      text: t.text,
      ...(marks.has('bold') && { bold: true }),
      ...(marks.has('italic') && { italic: true }),
    };
  });
}
