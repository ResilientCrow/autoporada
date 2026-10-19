import { randomBytes } from 'node:crypto';

/** 128 random bits for one response's CSP nonce. */
export const newNonce = (): string => randomBytes(16).toString('base64');

/**
 * The Content-Security-Policy of every page (plan §4). Scripts run only
 * with this response's nonce ('strict-dynamic' lets them load Next's
 * chunks); nothing loads from another origin, nothing frames the app, and
 * forms post only here. Development adds 'unsafe-eval' for hot reload.
 */
export function contentSecurityPolicy(nonce: string, options: { readonly dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
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
