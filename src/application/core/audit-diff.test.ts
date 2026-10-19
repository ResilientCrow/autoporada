import { describe, expect, expectTypeOf, it } from 'vitest';

import { diffRecords, type AuditShape } from './audit-diff';

interface Sample {
  readonly role: string;
  readonly isStudent: boolean;
  readonly updatedAt: Date;
  readonly version: number;
  readonly body: { readonly text: string };
}

const SHAPE: AuditShape<Sample> = {
  role: 'value',
  isStudent: 'value',
  updatedAt: 'value',
  version: 'omit',
  body: (body) => body.text,
};

const before: Sample = {
  role: 'submitter',
  isStudent: false,
  updatedAt: new Date('2026-10-19T08:00:00Z'),
  version: 1,
  body: { text: 'a' },
};

describe('diffRecords', () => {
  it('lists the changed fields only, dates as ISO strings, omitted fields never', () => {
    const after = {
      ...before,
      role: 'reviewer',
      version: 2,
      updatedAt: new Date('2026-10-19T09:00:00Z'),
    };
    expect(diffRecords(SHAPE, before, after)).toEqual({
      role: { from: 'submitter', to: 'reviewer' },
      updatedAt: { from: '2026-10-19T08:00:00.000Z', to: '2026-10-19T09:00:00.000Z' },
    });
  });

  it('shows creation and deletion against null', () => {
    expect(diffRecords(SHAPE, null, before)).toMatchObject({
      role: { from: null, to: 'submitter' },
      body: { from: null, to: 'a' },
    });
    expect(diffRecords(SHAPE, before, null)).toMatchObject({
      isStudent: { from: false, to: null },
    });
  });

  it('needs a rule for every field', () => {
    expectTypeOf<AuditShape<Sample>>().toHaveProperty('body');
    // @ts-expect-error: `version` has no rule
    const missing: AuditShape<Sample> = {
      role: 'value',
      isStudent: 'value',
      updatedAt: 'value',
      body: 'omit',
    };
    void missing;
  });

  it('refuses to log an object it was not told how to show', () => {
    const shape = { ...SHAPE, body: 'value' } as AuditShape<Sample>;
    expect(() => diffRecords(shape, before, { ...before, body: { text: 'b' } })).toThrow(TypeError);
  });
});
