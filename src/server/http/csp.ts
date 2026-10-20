import { randomBytes } from 'node:crypto';

/** 128 random bits for one response's CSP nonce. */
export const newNonce = (): string => randomBytes(16).toString('base64');

/** The request header the proxy sets with this response's nonce, and pages read. */
export const NONCE_HEADER = 'x-nonce';

/**
 * The Content-Security-Policy of every page (plan §4). Scripts run only
 * with this response's nonce ('strict-dynamic' lets them load Next's
 * chunks); nothing loads from another origin, nothing frames the app, and
 * forms post only here. Development adds 'unsafe-eval' for hot reload.
 * Inline event handlers and style attributes are refused: browsers already
 * fall back to script-src and style-src for them, and spelling the attribute
 * directives out pins the decision (ADR 0012).
 */
export function contentSecurityPolicy(nonce: string, options: { readonly dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join('; ');
}
