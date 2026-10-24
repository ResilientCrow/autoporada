import { describe, expect, it } from 'vitest';
import type { FieldIssueCode } from '@/contracts';
import { fieldIssues } from '@/ui/copy';
import {
  fieldId,
  fieldMessage,
  summaryItems,
  textOf,
  choiceOf,
  flagOf,
  type FieldSpec,
  type FormSpec,
} from './spec';

const title: FieldSpec = {
  label: 'Název',
  required: true,
  messages: { required: 'Zadejte název.' },
};
const spec: FormSpec = {
  title,
  note: { label: 'Poznámka' },
};
const codes = Object.keys(fieldIssues) as FieldIssueCode[];

describe('fieldId', () => {
  it('is stable, unique per form and id-safe', () => {
    expect(fieldId('a', 'statements.0.quote')).toBe(fieldId('a', 'statements.0.quote'));
    expect(fieldId('a', 'title')).not.toBe(fieldId('b', 'title'));
    expect(fieldId('a', 'statements.0.quote')).not.toBe(fieldId('a', 'statements.1.quote'));
    expect(fieldId('a', 'statements.0.quote')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('fieldMessage', () => {
  it('prefers the field own message', () => {
    expect(fieldMessage(spec, 'title', 'required')).toBe('Zadejte název.');
  });

  it.each(codes)('falls back to the generic text for %s', (code) => {
    expect(fieldMessage(spec, 'note', code)).toBe(fieldIssues[code]);
    expect(fieldMessage(spec, 'unknown', code)).toBe(fieldIssues[code]);
    if (code !== 'required') expect(fieldMessage(spec, 'title', code)).toBe(fieldIssues[code]);
  });

  it('covers all four codes', () => {
    expect(codes).toHaveLength(4);
  });
});

describe('summaryItems', () => {
  it('lists issues in spec order, linked, with unknown paths last and unlinked', () => {
    const items = summaryItems('f', spec, { x: 'invalid', note: 'too-long', title: 'required' });
    expect(items).toEqual([
      { id: 'f-title', text: 'Název: Zadejte název.' },
      { id: 'f-note', text: `Poznámka: ${fieldIssues['too-long']}` },
      { id: null, text: fieldIssues.invalid },
    ]);
  });

  it('is empty without issues', () => {
    expect(summaryItems('f', spec, {})).toEqual([]);
  });
});

describe('textOf', () => {
  it('returns the text, or an empty string when absent or not text', () => {
    const data = new FormData();
    data.set('a', 'abc');
    data.set('file', new Blob(['x']), 'x.txt');
    expect(textOf(data, 'a')).toBe('abc');
    expect(textOf(data, 'missing')).toBe('');
    expect(textOf(data, 'file')).toBe('');
  });
});

describe('choiceOf', () => {
  const values = ['a', 'b'] as const;

  it('returns a known value', () => {
    const data = new FormData();
    data.set('pick', 'b');
    expect(choiceOf(data, 'pick', values)).toBe('b');
  });

  it('throws when the value is missing, unknown or not text', () => {
    const data = new FormData();
    expect(() => choiceOf(data, 'pick', values)).toThrow('pick');
    data.set('pick', 'c');
    expect(() => choiceOf(data, 'pick', values)).toThrow('pick');
    data.set('pick', new Blob(['a']), 'a.txt');
    expect(() => choiceOf(data, 'pick', values)).toThrow('pick');
  });
});

describe('flagOf', () => {
  it('is true for a ticked box and false for a missing one', () => {
    const data = new FormData();
    data.set('confirmed', 'on');
    expect(flagOf(data, 'confirmed')).toBe(true);
    expect(flagOf(data, 'other')).toBe(false);
  });
});
