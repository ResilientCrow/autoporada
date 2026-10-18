import { typographize, typographizeText } from '@/domain/cs';
import { paragraphRuns, type RichDoc } from '@/domain/richtext';

import type { Block, Run } from '../model';

/** Tokens a standing text may contain, replaced at compose time. */
export interface Tokens {
  /** „2026/2027“ */
  readonly skolniRok: string;
}

const TOKEN = /\{(skolniRok)\}/g;

function replaceTokens(text: string, tokens: Tokens): string {
  return text.replace(TOKEN, (_, name: keyof Tokens) => tokens[name]);
}

/** Final text: tokens filled in, Czech typography applied. */
export function finalText(text: string, tokens?: Tokens): string {
  return typographizeText(tokens ? replaceTokens(text, tokens) : text);
}

/** Final runs, typography applied across run boundaries. */
export function finalRuns(runs: readonly Run[], tokens?: Tokens): Run[] {
  return typographize(
    runs.map((r) => (tokens ? { ...r, text: replaceTokens(r.text, tokens) } : r)),
  );
}

/** Strips quotes a submitter typed around a statement; the document adds „…“ itself. */
export function quoted(quote: string): string {
  return `„${quote
    .trim()
    .replace(/^["„“”'‚‘]+|["„“”'‚‘]+$/g, '')
    .trim()}“`;
}

/**
 * Rich text → blocks. Indent 0 is a body paragraph; 1–3 are the template's
 * „o“ / „o“ / „■“ levels. Level „o“ (indent 1) is always bold italic, as in
 * every standing item of the template.
 */
export function richBlocks(doc: RichDoc, tokens: Tokens): Block[] {
  return doc.content.map((paragraph) => {
    const runs = finalRuns(paragraphRuns(paragraph), tokens);
    const indent = paragraph.attrs.indent;
    if (indent === 0) return { kind: 'body', runs };
    if (indent === 1)
      return {
        kind: 'rich',
        level: 0,
        runs: runs.map((r) => ({ ...r, bold: true, italic: true })),
      };
    return { kind: 'rich', level: indent === 2 ? 1 : 2, runs };
  });
}

export const spacer = (count = 1): Block[] =>
  Array.from({ length: count }, () => ({ kind: 'spacer' }));

/** A numbered point: heading, content, one empty line. Numbers are assigned at the end. */
export function point(title: string, content: readonly Block[]): Block[] {
  return [{ kind: 'point', number: 0, text: finalText(title) }, ...content, ...spacer()];
}
