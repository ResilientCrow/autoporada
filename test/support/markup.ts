/** What the Content-Security-Policy refuses in server-rendered markup (ADR 0012). */

/** Inline styles are refused; an entry here would be a documented exception. */
const ALLOWED_STYLE_ATTRIBUTES: ReadonlySet<string> = new Set();

const CHECKS: readonly (readonly [RegExp, string])[] = [
  [/\sstyle=/, 'style attribute'],
  [/<style/i, 'style element'],
  [/<script/i, 'script element'],
  [/\son[a-z]+=/i, 'event handler attribute'],
  [/javascript:/i, 'javascript: URL'],
  [/="data:/i, 'data: URL'],
];

/** The CSP problems of rendered HTML, empty when it is clean. */
export function cspMarkupProblems(html: string): string[] {
  const problems = CHECKS.filter(([pattern]) => pattern.test(html)).map(([, name]) => name);
  const styles = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]!);
  return problems.filter((name) => name !== 'style attribute' || !styles.every(allowed));
}

function allowed(style: string): boolean {
  return ALLOWED_STYLE_ATTRIBUTES.has(style);
}
