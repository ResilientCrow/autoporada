import { NextResponse, type NextRequest } from 'next/server';

import {
  contentSecurityPolicy,
  newNonce,
  NONCE_HEADER,
  withoutRepeatedCookies,
} from '@/server/http';

/**
 * Sets a fresh nonce CSP on every page, and drops a cookie sent twice
 * before Next parses the header. Never a gate: sign-in is checked by the
 * pages, routes and actions themselves (plan §4).
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === 'development' });
  // Overwrites anything the client sent; Next reads the nonce from this request header.
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set('content-security-policy', csp);
  const cookie = request.headers.get('cookie');
  if (cookie !== null) {
    const kept = withoutRepeatedCookies(cookie);
    if (kept === null) headers.delete('cookie');
    else headers.set('cookie', kept);
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * The two JSON/PDF endpoints that take big bodies stay out: Next buffers a matched request's body
 * for the proxy (and cuts it at `proxyClientMaxBodySize`, 10 MB), and they answer no page, so
 * a nonce and a CSP mean nothing there. They read the raw Cookie header with `sessionTokenFrom`,
 * which already counts a repeated cookie as none, and the request id is Caddy's header. The matcher
 * must be a plain string literal: Next parses `config` statically and refuses a template literal.
 */

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|api/arch/run$|api/arch/convert$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
