import { describe, expect, it } from 'vitest';

import { cs } from './cs';

/** Flattens the nested catalogue into [path, text] pairs. */
function entries(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      entries(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe('Czech copy catalogue', () => {
  const all = entries(cs);

  it('has no empty strings', () => {
    expect(all.filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it('uses Czech quotes „…“, never straight double quotes', () => {
    expect(all.filter(([, text]) => text.includes('"'))).toEqual([]);
  });

  it('uses an en dash, never a spaced hyphen', () => {
    expect(all.filter(([, text]) => text.includes(' - '))).toEqual([]);
  });
});
