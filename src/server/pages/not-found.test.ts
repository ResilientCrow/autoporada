import { describe, expect, it } from 'vitest';

import type { PipelineFailure, Result } from '@/application/core';

import { orNotFound } from './not-found';
import { PageFailure } from './page-failure';

const failed = (code: string) =>
  ({ ok: false, error: { code } }) as unknown as Result<number, PipelineFailure>;

describe('orNotFound', () => {
  it('passes the value through', () => {
    expect(orNotFound('x', { ok: true, value: 3 })).toBe(3);
  });

  it.each(['forbidden', 'not-found', 'invalid-input'])('turns %s into null', (code) => {
    expect(orNotFound('x', failed(code))).toBeNull();
  });

  it('throws a page failure on any other failure, naming the call and not the cause in words', () => {
    const thrown = () => {
      try {
        orNotFound('users.get', failed('unavailable'));
      } catch (error) {
        return error;
      }
      return undefined;
    };
    expect(thrown()).toBeInstanceOf(PageFailure);
    expect(thrown()).toMatchObject({ message: 'users.get: unavailable', digest: 'autoporada:bug' });
  });

  it.each([
    ['busy', 'timeout'],
    ['conflict', 'bug'],
    ['step-up-required', 'bug'],
    ['rule', 'bug'],
  ] as const)('reads a %s failure as %s', (code, cause) => {
    expect(() => orNotFound('users.get', failed(code))).toThrow(
      expect.objectContaining({ digest: `autoporada:${cause}` }),
    );
  });
});
