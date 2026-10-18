import { hasForbiddenCharacters } from './characters';
import {
  LIMITS,
  type Indent,
  type Mark,
  type RichDoc,
  type RichParagraph,
  type RichProfile,
  type RichText,
} from './rich-doc';

export type ParseResult =
  | { readonly ok: true; readonly doc: RichDoc }
  | { readonly ok: false; readonly errors: readonly string[] };

const MARKS: ReadonlySet<string> = new Set<Mark>(['bold', 'italic']);
/** Records a problem; returns undefined so callers can `return fail(…)`. */
function fail(errors: string[], message: string): undefined {
  errors.push(message);
  return undefined;
}

/** Plain objects only: no class instances, getters behind prototypes or toJSON tricks. */
function isRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** UTF-8 size of the JSON, or undefined for input JSON cannot represent (cycles, BigInt, deep nesting). */
function jsonSize(input: unknown): number | undefined {
  try {
    return new TextEncoder().encode(JSON.stringify(input) ?? '').length;
  } catch {
    return undefined;
  }
}

function onlyKeys(
  node: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) errors.push(`${path}: unexpected "${key}"`);
  }
}

function parseText(node: unknown, path: string, errors: string[]): RichText | undefined {
  if (!isRecord(node) || node['type'] !== 'text')
    return fail(errors, `${path}: expected a text node`);
  onlyKeys(node, ['type', 'text', 'marks'], path, errors);
  const text = node['text'];
  if (typeof text !== 'string' || text === '')
    return fail(errors, `${path}: text must be a non-empty string`);
  if (hasForbiddenCharacters(text, { allowTab: true }))
    errors.push(`${path}: text contains control characters`);

  const rawMarks = node['marks'] ?? [];
  if (!Array.isArray(rawMarks)) return fail(errors, `${path}.marks: expected a list`);
  const marks = new Set<Mark>();
  rawMarks.forEach((m: unknown, i) => {
    if (!isRecord(m) || typeof m['type'] !== 'string' || !MARKS.has(m['type'])) {
      errors.push(`${path}.marks[${i}]: only bold and italic are allowed`);
    } else {
      onlyKeys(m, ['type'], `${path}.marks[${i}]`, errors);
      marks.add(m['type'] as Mark);
    }
  });
  const sorted = [...marks].sort();
  return {
    type: 'text',
    text,
    ...(sorted.length > 0 && { marks: sorted.map((type) => ({ type })) }),
  };
}

function parseParagraph(
  node: unknown,
  path: string,
  profile: RichProfile,
  errors: string[],
): RichParagraph | undefined {
  if (!isRecord(node) || node['type'] !== 'paragraph')
    return fail(errors, `${path}: expected a paragraph`);
  onlyKeys(node, ['type', 'attrs', 'content'], path, errors);

  const attrs = node['attrs'] ?? {};
  if (!isRecord(attrs)) return fail(errors, `${path}.attrs: expected an object`);
  onlyKeys(attrs, ['indent'], `${path}.attrs`, errors);
  const indent = attrs['indent'] ?? 0;
  const maxIndent = profile === 'paragraphs' ? 0 : 3;
  if (typeof indent !== 'number' || !Number.isInteger(indent) || indent < 0 || indent > maxIndent) {
    errors.push(`${path}.attrs.indent: must be an integer 0–${maxIndent}`);
  }

  const rawContent = node['content'] ?? [];
  if (!Array.isArray(rawContent)) return fail(errors, `${path}.content: expected a list`);
  const content = rawContent
    .map((child: unknown, i) => parseText(child, `${path}.content[${i}]`, errors))
    .filter((t): t is RichText => t !== undefined);
  return {
    type: 'paragraph',
    attrs: { indent: (typeof indent === 'number' ? indent : 0) as Indent },
    ...(content.length > 0 && { content }),
  };
}

/**
 * Validates untrusted rich-text JSON and returns a normalised copy. This is
 * the server-side source of truth; the editor's schema only mirrors it.
 */
export function parseRichDoc(input: unknown, profile: RichProfile): ParseResult {
  const errors: string[] = [];
  const size = jsonSize(input);
  if (size === undefined) return { ok: false, errors: ['document is not valid rich text'] };
  if (size > LIMITS.maxBytes) {
    return { ok: false, errors: [`document is larger than ${LIMITS.maxBytes / 1024} KB`] };
  }
  if (!isRecord(input) || input['type'] !== 'doc') return { ok: false, errors: ['expected a doc'] };
  onlyKeys(input, ['type', 'content'], 'doc', errors);
  const rawContent = input['content'] ?? [];
  if (!Array.isArray(rawContent)) return { ok: false, errors: ['doc.content: expected a list'] };

  const nodes = rawContent.reduce<number>(
    (n, p: unknown) =>
      n + 1 + (isRecord(p) && Array.isArray(p['content']) ? p['content'].length : 0),
    0,
  );
  if (nodes > LIMITS.maxNodes)
    return { ok: false, errors: [`document has more than ${LIMITS.maxNodes} nodes`] };

  const content = rawContent
    .map((p: unknown, i) => parseParagraph(p, `doc.content[${i}]`, profile, errors))
    .filter((p): p is RichParagraph => p !== undefined);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, doc: { type: 'doc', content } };
}
