/**
 * The letter around a template's paragraphs: greeting, the paragraphs, an
 * optional link to a page of the app, the footer. Plain text, one paragraph per
 * line, blank lines between. The strings are typeset by hand (non-breaking
 * spaces written as escapes, like src/ui/copy), so nothing here rewrites them.
 */

const GREETING = 'Dobrý den,';
const FOOTER = 'Tuto zprávu poslala aplikace Autoporada automaticky. Neodpovídejte na ni prosím.';

export interface Body {
  readonly paragraphs: readonly string[];
  /** Ends the body with a link to this page on the app origin (ADR 0020, 0028): sign-in, the author's points, the review queue or the users page. */
  readonly link?: '/prihlaseni' | '/body' | '/kontrola' | '/uzivatele';
  /** Paragraphs that follow the link, before the footer. */
  readonly after?: readonly string[];
}

export function frame(origin: string, body: Body): string {
  const link = body.link ? [`${origin}${body.link}`] : [];
  return [GREETING, ...body.paragraphs, ...link, ...(body.after ?? []), FOOTER].join('\n\n') + '\n';
}
