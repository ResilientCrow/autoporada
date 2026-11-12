import { describe, expect, it } from 'vitest';

import { decideFutureInput } from './future-review';
import { decidePointInput } from './point';

const id = '00000000-0000-4000-8000-000000000001';
const base = { id, expectedVersion: 1 };

/** The issues of a refused parse as `path:code`, or null when it parsed. */
function issues(schema: typeof decidePointInput | typeof decideFutureInput, input: object) {
  const result = schema.safeParse({ ...base, ...input });
  if (result.success) return null;
  return result.error.issues.map(
    (i) => `${i.path.join('.')}:${(i as { params?: { code?: string } }).params?.code ?? i.code}`,
  );
}

describe.each([
  ['decidePointInput', decidePointInput, ['heading', 'body'], 'title'],
  ['decideFutureInput', decideFutureInput, ['title', 'when'], 'heading'],
] as const)('%s', (_name, schema, validParts, foreignPart) => {
  it('takes an approval with neither a note nor parts', () => {
    expect(issues(schema, { event: 'approve' })).toBeNull();
  });

  it('refuses an approval with a note or with parts', () => {
    expect(issues(schema, { event: 'approve', note: 'x' })).toEqual(['note:invalid']);
    expect(issues(schema, { event: 'approve', parts: [validParts[0]] })).toEqual(['parts:invalid']);
  });

  it('takes a return with a note, with parts, or with both', () => {
    expect(issues(schema, { event: 'return', note: 'Doplňte.' })).toBeNull();
    expect(issues(schema, { event: 'return', parts: [...validParts] })).toBeNull();
    expect(
      issues(schema, { event: 'return', note: 'Doplňte.', parts: [...validParts] }),
    ).toBeNull();
  });

  it('refuses a return with neither a note nor parts', () => {
    expect(issues(schema, { event: 'return' })).toEqual(['note:required']);
    expect(issues(schema, { event: 'return', note: '   ' })).not.toBeNull();
  });

  it('needs a note for a reject, and refuses parts on it', () => {
    expect(issues(schema, { event: 'reject' })).toEqual(['note:required']);
    expect(issues(schema, { event: 'reject', note: 'Ne.' })).toBeNull();
    expect(issues(schema, { event: 'reject', note: 'Ne.', parts: [validParts[0]] })).toEqual([
      'parts:invalid',
    ]);
    expect(issues(schema, { event: 'reject', parts: [validParts[0]] })).toContain('parts:invalid');
  });

  it('refuses an empty list, a duplicate, a fifth part and a code of the other kind', () => {
    expect(issues(schema, { event: 'return', parts: [] })).not.toBeNull();
    expect(
      issues(schema, { event: 'return', parts: [validParts[0], validParts[0]] }),
    ).not.toBeNull();
    expect(issues(schema, { event: 'return', parts: [foreignPart] })).not.toBeNull();
    expect(issues(schema, { event: 'return', parts: ['a', 'b', 'c', 'd', 'e'] })).not.toBeNull();
  });
});
