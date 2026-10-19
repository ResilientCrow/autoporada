import { NextResponse, type NextRequest } from 'next/server';

import { contentSecurityPolicy, newNonce, withoutRepeatedCookies } from '@/server/http';

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
  headers.set('x-nonce', nonce);
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

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
