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
      'script-src-attr': ["'none'"],
      'style-src': ["'self'", "'nonce-N0nce'"],
      'style-src-attr': ["'none'"],
      // Branch arch-ui: annex images read from a file.
      'img-src': ["'self'", 'data:', 'blob:'],
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

  it('never allows inline code in production', () => {
    const policy = contentSecurityPolicy('N', { dev: false });
    expect(policy).not.toMatch(/unsafe-inline|\*/);
    // Branch arch-ui: data: and other hosts only for images and the Google fonts, never for code.
    const prod = directives(policy);
    for (const name of ['default-src', 'script-src', 'connect-src', 'object-src', 'frame-src']) {
      expect(prod.get(name)?.join(' '), name).not.toMatch(/data:|blob:|http/);
    }
  });

  it('lets development inline style elements only, for the Next.js devtools (ADR 0042)', () => {
    const policy = contentSecurityPolicy('N', { dev: true });
    const dev = directives(policy);
    // A nonce next to 'unsafe-inline' would make browsers ignore it.
    expect(dev.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(dev.get('style-src-attr')).toEqual(["'none'"]);
    expect(dev.get('script-src')).not.toContain("'unsafe-inline'");
    expect(policy).not.toMatch(/\*/);
    expect(dev.get('script-src')?.join(' ')).not.toMatch(/data:|blob:|http/);
  });
});
