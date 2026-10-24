import { describe, expect, it } from 'vitest';

import type { PipelineFailure, Result } from '@/application/core';

import { orNotFound } from './not-found';

const failed = (code: string) =>
  ({ ok: false, error: { code } }) as unknown as Result<number, PipelineFailure>;

describe('orNotFound', () => {
  it('passes the value through', () => {
    expect(orNotFound('x', { ok: true, value: 3 })).toBe(3);
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('turns %s into null', (code) => {
    expect(orNotFound('x', failed(code))).toBeNull();
  });

  it('throws on any other failure, naming the call', () => {
    expect(() => orNotFound('users.get', failed('unavailable'))).toThrow('users.get: unavailable');
  });
});
