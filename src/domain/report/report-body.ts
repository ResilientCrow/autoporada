import { richDocFromText, type RichDoc } from '@/domain/richtext';

/**
 * A report's body as the snapshot stores it: the opening sentence, when it is
 * not blank, as the first paragraph (one per line), then the body. The one
 * place the two meet, for the preview, the snapshot builder and readiness.
 */
export function reportBody(opening: string, body: RichDoc): RichDoc {
  const lead = opening.trim();
  if (lead === '') return body;
  return { type: 'doc', content: [...richDocFromText(lead).content, ...body.content] };
}
