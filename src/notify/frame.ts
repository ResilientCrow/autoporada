/**
 * The letter around a template's paragraphs: greeting, the paragraphs, an
 * optional link to the sign-in page, the footer. Plain text, one paragraph per
 * line, blank lines between. The strings are typeset by hand (non-breaking
 * spaces written as escapes, like src/ui/copy), so nothing here rewrites them.
 */

const GREETING = 'Dobrý den,';
const FOOTER = 'Tuto zprávu poslala aplikace Autoporada automaticky. Neodpovídejte na ni prosím.';

export interface Body {
  readonly paragraphs: readonly string[];
  /** Ends the body with the link to the sign-in page on the app origin. */
  readonly signInLink?: boolean;
}

export function frame(origin: string, body: Body): string {
  const link = body.signInLink ? [`${origin}/prihlaseni`] : [];
  return [GREETING, ...body.paragraphs, ...link, FOOTER].join('\n\n') + '\n';
}
