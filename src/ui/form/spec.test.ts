import { describe, expect, it } from 'vitest';
import type { FieldIssueCode } from '@/contracts';
import { fieldIssues } from '@/ui/copy';
import { fieldId, fieldMessage, type FieldSpec, type FormSpec } from './spec';

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
