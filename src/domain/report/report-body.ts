import {
  richDocFromText,
  type RichDoc,
  type RichParagraph,
  type RichText,
} from '@/domain/richtext';

/** The runs of a paragraph without the white space it starts with; empty when it holds no text. */
function trimStart(runs: readonly RichText[]): readonly RichText[] {
  const at = runs.findIndex((run) => run.text.trim() !== '');
  if (at === -1) return [];
  const first = runs[at]!;
  return [{ ...first, text: first.text.trimStart() }, ...runs.slice(at + 1)];
}

/**
 * A report's body as the snapshot stores it: the opening sentence, when it is
 * not blank, one paragraph per line, its last line going on with the body's
 * first paragraph as the printed reports do; then the rest of the body. A body
 * that opens with an empty paragraph starts on its own. The one place the two
 * meet, for the preview, the snapshot builder and readiness.
 */
export function reportBody(opening: string, body: RichDoc): RichDoc {
  const lead = opening.trim();
  if (lead === '') return body;
  const lines = richDocFromText(lead).content;
  const last = lines.at(-1)!;
  const [first, ...rest] = body.content;
  const runs = first ? trimStart(first.content ?? []) : [];
  if (runs.length === 0) return { type: 'doc', content: [...lines, ...body.content] };
  const lastLine = last.content?.[0]?.text ?? '';
  const joined: RichParagraph = {
    ...last,
    content: [{ type: 'text', text: `${lastLine} ` }, ...runs],
  };
  return { type: 'doc', content: [...lines.slice(0, -1), joined, ...rest] };
}
