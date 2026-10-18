import { describe, expect, it } from 'vitest';

import { toIsoDate } from '@/domain/time';

import {
  auditCutoff,
  isPurgeableAccessRequest,
  isPurgeableFutureItem,
  isPurgeablePoint,
  schoolYearEnd,
} from './index';

describe('retention', () => {
  it('purges only work that never reached an issue', () => {
    expect(
      ['draft', 'returned', 'rejected', 'withdrawn'].every((s) => isPurgeablePoint(s as never)),
    ).toBe(true);
    expect(isPurgeablePoint('published')).toBe(false);
    expect(isPurgeablePoint('approved')).toBe(false);
    expect(isPurgeablePoint('submitted')).toBe(false);
    expect(isPurgeableFutureItem('cancelled')).toBe(false);
    expect(isPurgeableFutureItem('withdrawn')).toBe(true);
  });

  it('keeps blocked and pending access requests', () => {
    expect(isPurgeableAccessRequest('blocked')).toBe(false);
    expect(isPurgeableAccessRequest('pending')).toBe(false);
    expect(isPurgeableAccessRequest('rejected')).toBe(true);
  });

  it('ends a school year on 31 August', () => {
    expect(toIsoDate(schoolYearEnd('2026/2027'))).toBe('2027-08-31');
    expect(() => schoolYearEnd('2026/2028')).toThrow(RangeError);
    expect(() => schoolYearEnd('26/27')).toThrow(RangeError);
  });

  it('keeps the audit log three years', () => {
    expect(auditCutoff(new Date('2026-10-18T12:00:00Z')).toISOString()).toBe(
      '2023-10-18T12:00:00.000Z',
    );
  });
});
