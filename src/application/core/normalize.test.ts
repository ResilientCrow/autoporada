import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hasForbiddenCharacters } from '@/domain/richtext';

import { INPUT_LIMITS, normalizeInput } from './normalize';

const value = (input: unknown) => {
  const result = normalizeInput(input);
  if (!result.ok) throw new Error('refused');
  return result.value;
};
const strings = (node: unknown): string[] =>
  typeof node === 'string'
    ? [node]
    : Array.isArray(node)
      ? node.flatMap(strings)
      : node && typeof node === 'object'
        ? Object.values(node).flatMap(strings)
        : [];
const anyText = fc.string({ unit: 'binary', maxLength: 40 });
/** Keys the normaliser refuses on purpose; generated JSON may contain them. */
const prototypeKey = (node: unknown): boolean =>
  Array.isArray(node)
    ? node.some(prototypeKey)
    : !!node &&
      typeof node === 'object' &&
      Object.entries(node).some(
        ([key, child]) =>
          ['__proto__', 'constructor', 'prototype'].includes(key) || prototypeKey(child),
      );
const json = fc.jsonValue({ maxDepth: 4 }).filter((node) => !prototypeKey(node));

describe('normalizeInput', () => {
  it('unifies line endings, strips forbidden characters and composes to NFC', () => {
    expect(value({ text: 'Jana\r\nNova\u0301kov\u00E1\r\u202Eok\u0000' })).toEqual({
      text: 'Jana\nNov\u00E1kov\u00E1\nok',
    });
    expect(value(['tab\tstays'])).toEqual(['tab\tstays']);
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.oneof(json, anyText), (input) => {
        const once = value(input);
        expect(value(once)).toEqual(once);
      }),
    );
  });

  it('leaves only NFC text without forbidden characters (newlines stay)', () => {
    fc.assert(
      fc.property(fc.array(anyText), (texts) => {
        for (const text of strings(value(texts))) {
          expect(text).toBe(text.normalize('NFC'));
          expect(hasForbiddenCharacters(text.replaceAll('\n', ''), { allowTab: true })).toBe(false);
        }
      }),
    );
  });

  it('keeps the shape of plain JSON', () => {
    const shape = (node: unknown): unknown =>
      Array.isArray(node)
        ? node.map(shape)
        : node && typeof node === 'object'
          ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shape(v)]))
          : typeof node;
    fc.assert(
      fc.property(json, (input) => {
        expect(shape(value(input))).toEqual(shape(input));
      }),
    );
  });

  it.each([
    ['a date', { at: new Date() }],
    ['a map', { m: new Map() }],
    ['form data', new FormData()],
    ['a class instance', { x: new (class Point {})() }],
    ['a prototype key', JSON.parse('{"__proto__": {"role": "headmaster"}}') as unknown],
    ['a constructor key', { constructor: 'x' }],
    ['a symbol key', { [Symbol('s')]: 1 }],
    ['NaN', { n: Number.NaN }],
    ['a function', { f: () => 1 }],
    ['a bigint', { b: 1n }],
  ])('refuses %s', (_name, input) => {
    expect(normalizeInput(input)).toEqual({ ok: false });
  });

  it('refuses input beyond the depth, node and size limits', () => {
    let deep: unknown = 'x';
    for (let i = 0; i <= INPUT_LIMITS.depth; i++) deep = [deep];
    expect(normalizeInput(deep)).toEqual({ ok: false });
    expect(normalizeInput(new Array(INPUT_LIMITS.nodes).fill(0))).toEqual({ ok: false });
    expect(normalizeInput({ text: 'x'.repeat(INPUT_LIMITS.characters + 1) })).toEqual({
      ok: false,
    });
    expect(normalizeInput({ text: 'x'.repeat(1000) }).ok).toBe(true);
  });
});
