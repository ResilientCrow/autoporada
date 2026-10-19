import { NextRequest } from 'next/server';
import {
  unstable_doesMiddlewareMatch as matches,
  unstable_getResponseFromNextConfig as configResponse,
} from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';
import { config, proxy } from './proxy';

const ORIGIN = 'https://autoporada.ssps.cz';
const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

describe('proxy', () => {
  it('gives every page its own nonce, in the response and in the request Next renders', () => {
    const first = proxy(new NextRequest(`${ORIGIN}/`));
    const second = proxy(new NextRequest(`${ORIGIN}/`));
    const csp = first.headers.get('content-security-policy');
    const nonce = nonceOf(csp);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonceOf(second.headers.get('content-security-policy'))).not.toBe(nonce);
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('ignores a nonce or a policy the client sent', () => {
    const response = proxy(
      new NextRequest(`${ORIGIN}/`, {
        headers: { 'x-nonce': 'chosen', 'content-security-policy': "script-src 'unsafe-inline'" },
      }),
    );
    const csp = response.headers.get('content-security-policy');
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(csp).not.toContain('chosen');
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('never redirects or answers: pages and routes check sign-in themselves', () => {
    const response = proxy(new NextRequest(`${ORIGIN}/porada`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('proxy matcher', () => {
  it.each(['/', '/prihlaseni?chyba=failed', '/auth/callback?code=x&state=y', '/porada/2026-10-19'])(
    'runs for %s',
    (path) => {
      expect(matches({ config, url: path, nextConfig })).toBe(true);
    },
  );

  it.each(['/_next/static/chunks/main.js', '/_next/image?url=%2Fa.png&w=64&q=75', '/favicon.ico'])(
    'skips the static file %s',
    (path) => {
      expect(matches({ config, url: path, nextConfig })).toBe(false);
    },
  );

  it.each([{ 'next-router-prefetch': '1' }, { purpose: 'prefetch' }])(
    'skips a prefetch (%o)',
    (headers) => {
      expect(matches({ config, url: '/', headers, nextConfig })).toBe(false);
    },
  );
});

describe('next.config headers', () => {
  it.each(['/', '/auth/login', '/_next/static/chunks/main.js'])(
    'sends the fixed security headers on %s',
    async (path) => {
      const response = await configResponse({ url: `${ORIGIN}${path}`, nextConfig });
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'same-origin',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        'x-frame-options': 'DENY',
        'permissions-policy': expect.stringContaining('camera=()'),
      });
      // HSTS belongs to Caddy, which terminates TLS.
      expect(response.headers.has('strict-transport-security')).toBe(false);
    },
  );
});
