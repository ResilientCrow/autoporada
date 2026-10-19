import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { HOME_PATH, safeReturnTo } from './index';

describe('safeReturnTo', () => {
  it.each<[unknown, string]>([
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/\tevil', '/'],
    ['/.//evil.example', '/'],
    ['%2f%2fevil.example', '/'],
    ['https:evil.example', '/'],
    ['https://evil.example/x', '/'],
    ['/x\u3002evil', '/'],
    ['/x\r\nSet-Cookie: a=b', '/'],
    ['/' + 'x'.repeat(600), '/'],
    ['/auth/logout', '/'],
    ['/auth', '/'],
    ['/prihlaseni?returnTo=/x', '/'],
    ['', '/'],
    [undefined, '/'],
    [42, '/'],
    ['/porada/2026-10-19?tab=body#part', '/porada/2026-10-19?tab=body'],
    ['/a/../b', '/b'],
    ['/prihlasenix', '/prihlasenix'],
    ['/authors', '/authors'],
  ])('%j → %j', (raw, path) => {
    expect(safeReturnTo(raw)).toBe(path);
  });

  it('always stays on this origin, and is idempotent', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.webPath(), fc.webUrl()), (raw) => {
        const path = safeReturnTo(raw);
        expect(new URL(path, 'https://autoporada.ssps.cz').origin).toBe(
          'https://autoporada.ssps.cz',
        );
        expect(path).toMatch(/^\/(?![/\\])/);
        expect(safeReturnTo(path)).toBe(path);
      }),
    );
    expect(HOME_PATH).toBe('/');
  });
});
