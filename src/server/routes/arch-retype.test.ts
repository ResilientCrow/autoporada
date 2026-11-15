import { describe, expect, it } from 'vitest';

import { retypeRequest } from './arch-retype';

const ID = '0190e5f2-0000-7000-8000-000000000001';
const at = (patch: Record<string, unknown>) => ({ id: ID, expectedVersion: 3, ...patch });

describe('retypeRequest', () => {
  it('switches a proposal between finance and pokyn', () => {
    expect(retypeRequest(at({ kind: 'pokyn' }))).toEqual({
      id: ID,
      expectedVersion: 3,
      kind: 'pokyn',
    });
    expect(retypeRequest(at({ kind: 'finance' }))?.kind).toBe('finance');
  });

  it.each(['report', 'Seminář', '__proto__', '', undefined])(
    'refuses a kind that is not finance or pokyn: %j',
    (kind) => {
      expect(retypeRequest(at({ kind }))).toBeNull();
    },
  );

  it('refuses a request without a point id or its version', () => {
    expect(retypeRequest({ expectedVersion: 3, kind: 'pokyn' })).toBeNull();
    expect(retypeRequest({ id: 'not-a-uuid', expectedVersion: 3, kind: 'pokyn' })).toBeNull();
    expect(retypeRequest({ id: ID, expectedVersion: '3', kind: 'pokyn' })).toBeNull();
    expect(retypeRequest(null)).toBeNull();
  });
});
