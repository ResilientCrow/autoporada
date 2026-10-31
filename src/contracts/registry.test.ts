import { describe, expect, it } from 'vitest';

import { parsePaste } from '@/domain/registry';

import { previewPasteInput, saveEntryInput } from './registry';

const id = '0198f000-0000-7000-8000-000000000001';
const student = { id, version: 1, givenName: 'Jan', familyName: 'Novak' };

describe('registry contract bounds', () => {
  it('refuses a class code far over twelve characters within a small time budget', () => {
    const started = performance.now();
    const parsed = saveEntryInput.safeParse({
      ...student,
      classCode: `1${' '.repeat(100_000)}!`,
    });
    expect(parsed.success).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('accepts a normal class code', () => {
    const parsed = saveEntryInput.parse({ ...student, classCode: ' 1a ' });
    expect(parsed.classCode).toBe('1.A');
  });

  it('parses a paste full of spaces within a small time budget', () => {
    const text = `Jan Novak (A1${' '.repeat(19_970)}!)`;
    expect(previewPasteInput.safeParse({ listId: id, text, order: 'given-family' }).success).toBe(
      true,
    );
    const started = performance.now();
    parsePaste(text);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
