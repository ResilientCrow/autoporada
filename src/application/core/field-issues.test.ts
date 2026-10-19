import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toFieldIssues } from './field-issues';

const schema = z.strictObject({
  title: z.string().min(1).max(10),
  reason: z.string().min(5),
  statements: z.array(z.strictObject({ quote: z.string().min(1) })).max(2),
  count: z.number().int(),
  note: z.string().refine((s) => !s.includes('x'), { params: { code: 'too-short' } }),
});

const issues = (input: unknown) => {
  const parsed = schema.safeParse(input, { reportInput: true });
  if (parsed.success) throw new Error('expected issues');
  return toFieldIssues(parsed.error);
};

describe('toFieldIssues', () => {
  it('reports numbers out of range as invalid, never as missing or too long', () => {
    const numbers = z.strictObject({
      version: z.number().int().min(1),
      count: z.number().nonnegative(),
      big: z.number().max(5),
    });
    const parsed = numbers.safeParse({ version: 0, count: -3, big: 9 }, { reportInput: true });
    if (parsed.success) throw new Error('expected issues');
    expect(toFieldIssues(parsed.error)).toEqual({
      version: 'invalid',
      count: 'invalid',
      big: 'invalid',
    });
  });

  it('turns Zod issues into one code per field, without messages', () => {
    expect(
      issues({
        title: 'x'.repeat(11),
        reason: 'abc',
        statements: [{ quote: 'ok' }, { quote: 'ok' }, { quote: 'ok' }],
        count: 'seven',
        note: 'xx',
      }),
    ).toEqual({
      title: 'too-long',
      reason: 'too-short',
      statements: 'too-long',
      count: 'invalid',
      note: 'too-short',
    });
  });

  it('reports missing fields and empty texts as required, by path', () => {
    expect(issues({})).toMatchObject({ title: 'required', reason: 'required', count: 'required' });
    expect(issues({ statements: [{ quote: 'ok' }, { quote: '' }] })).toMatchObject({
      'statements.1.quote': 'required',
    });
  });

  it('names no field for unknown keys and drops paths it cannot trust', () => {
    expect(
      issues({ title: 'ok', reason: 'okay!', statements: [], count: 1, note: '', extra: 1 }),
    ).toEqual({});
    const odd = z
      .record(z.string(), z.number())
      .safeParse({ 'bad key!': 'x' }, { reportInput: true });
    expect(odd.success).toBe(false);
    if (!odd.success) expect(toFieldIssues(odd.error)).toEqual({});
  });

  it('reports at most 50 fields', () => {
    const many = z.strictObject(
      Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, z.string()])),
    );
    const parsed = many.safeParse({}, { reportInput: true });
    if (parsed.success) throw new Error('expected issues');
    expect(Object.keys(toFieldIssues(parsed.error))).toHaveLength(50);
  });
});
