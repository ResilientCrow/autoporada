/**
 * Characters the official document never carries, wherever text comes from:
 * - C0/C1 controls (XML 1.0 cannot hold most of them) and the Unicode line
 *   and paragraph separators, which would break a line inside a paragraph;
 * - bidirectional embeddings, overrides, isolates and marks, which visually
 *   reverse the text that follows, including names written by others;
 * - the noncharacters U+FFFE/U+FFFF and lone surrogates.
 */
const CONTROLS = String.raw`\u0000-\u0008\u000B-\u001F\u007F-\u009F`;
const FORMATTING = String.raw`\u061C\u200E\u200F\u2028-\u202E\u2066-\u2069\uFFFE\uFFFF`;
const LONE_SURROGATE = String.raw`[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]`;

/** Inside a paragraph a newline is forbidden too; the paragraph structure carries line breaks. */
const FORBIDDEN = new RegExp(String.raw`[\n${CONTROLS}${FORMATTING}]|${LONE_SURROGATE}`);
/** Form input keeps its newlines: multi-line fields are split into paragraphs later. */
const STRIPPED = new RegExp(String.raw`[${CONTROLS}${FORMATTING}]|${LONE_SURROGATE}`, 'g');

/** Rich text may contain tabs; single-line fields may not. */
export function hasForbiddenCharacters(text: string, { allowTab }: { allowTab: boolean }): boolean {
  return FORBIDDEN.test(text) || (!allowTab && text.includes('\t'));
}

/** Removes every forbidden character except the newline (ADR 0011: input normalisation). */
export function stripForbiddenCharacters(text: string): string {
  return text.replace(STRIPPED, '');
}

/**
 * Form input for a field that prints on one line: every run of spaces that
 * holds a newline or a tab becomes one space, and the ends are trimmed. The
 * snapshot refuses a tab or a newline in such a field, and the document
 * prints what is stored.
 */
export function singleLine(text: string): string {
  return text.replace(/ *[\t\r\n][ \t\r\n]*/g, ' ').trim();
}
