/**
 * Characters the official document never carries, wherever text comes from:
 * - C0/C1 controls (XML 1.0 cannot hold most of them) and the Unicode line
 *   and paragraph separators, which would break a line inside a paragraph;
 * - bidirectional embeddings, overrides, isolates and marks, which visually
 *   reverse the text that follows, including names written by others;
 * - the noncharacters U+FFFE/U+FFFF and lone surrogates.
 */
const FORBIDDEN =
  /[\u0000-\u0008\u000A-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028-\u202E\u2066-\u2069\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Rich text may contain tabs; single-line fields may not. */
export function hasForbiddenCharacters(text: string, { allowTab }: { allowTab: boolean }): boolean {
  return FORBIDDEN.test(text) || (!allowTab && text.includes('\t'));
}
