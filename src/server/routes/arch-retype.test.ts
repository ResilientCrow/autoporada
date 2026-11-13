import { describe, expect, it } from 'vitest';

import { retypeRequest } from './arch-retype';

const ID = '0190e5f2-0000-7000-8000-000000000001';
const at = (patch: Record<string, unknown>) => ({ id: ID, expectedVersion: 3, ...patch });

describe('retypeRequest', () => {
  it('takes a report type by its key (ADR 0064)', () => {
    expect(retypeRequest(at({ typeId: 'prednaska' }))).toEqual({
      id: ID,
      expectedVersion: 3,
      patch: { typeId: 'prednaska' },
    });
  });

  it.each(['Seminář', 'projektovy-den', '0190e5f2-0000-7000-8000-000000000000', '__proto__', ''])(
    'refuses a type that is not on the list: %j',
    (typeId) => {
      expect(retypeRequest(at({ typeId }))).toBeNull();
    },
  );

  it('switches a proposal between finance and pokyn', () => {
    expect(retypeRequest(at({ kind: 'pokyn' }))?.patch).toEqual({ kind: 'pokyn' });
    expect(retypeRequest(at({ kind: 'finance' }))?.patch).toEqual({ kind: 'finance' });
    expect(retypeRequest(at({ kind: 'report' }))).toBeNull();
  });

  it('refuses a request without a point id or its version', () => {
    expect(retypeRequest({ expectedVersion: 3, typeId: 'jine' })).toBeNull();
    expect(retypeRequest({ id: 'not-a-uuid', expectedVersion: 3, typeId: 'jine' })).toBeNull();
    expect(retypeRequest({ id: ID, expectedVersion: '3', typeId: 'jine' })).toBeNull();
    expect(retypeRequest(null)).toBeNull();
  });
});
