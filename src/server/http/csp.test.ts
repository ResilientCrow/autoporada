import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, newNonce } from './csp';

const directives = (policy: string) =>
  new Map(
    policy.split('; ').map((d) => {
      const [name = '', ...sources] = d.split(' ');
      return [name, sources];
    }),
  );

describe('newNonce', () => {
  it('is 128 random bits, fresh every time', () => {
    const nonces = new Set(Array.from({ length: 100 }, newNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
  });
});

describe('contentSecurityPolicy', () => {
  it('runs only this response’s scripts and loads nothing from elsewhere', () => {
    expect(Object.fromEntries(directives(contentSecurityPolicy('N0nce', { dev: false })))).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'nonce-N0nce'", "'strict-dynamic'"],
      'style-src': ["'self'", "'nonce-N0nce'"],
      'img-src': ["'self'"],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'frame-src': ["'none'"],
    });
  });

  it('allows eval only in development, for hot reload', () => {
    expect(directives(contentSecurityPolicy('N', { dev: true })).get('script-src')).toContain(
      "'unsafe-eval'",
    );
  });

  it('never allows inline code', () => {
    for (const dev of [false, true]) {
      expect(contentSecurityPolicy('N', { dev })).not.toMatch(/unsafe-inline|\*|data:|http/);
    }
  });
});
