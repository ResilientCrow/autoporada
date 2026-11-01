import { describe, expect, it } from 'vitest';

import { isAadstsCode, isSignInError, SIGN_IN_ERRORS } from './auth';
import { FAILURE_CAUSES, isFailureCause } from './failure';

describe('SIGN_IN_ERRORS', () => {
  it('names every failure cause, so a new one cannot be forgotten', () => {
    for (const cause of FAILURE_CAUSES) expect(SIGN_IN_ERRORS).toContain(cause);
  });

  it('names what Entra and its claims did, and no longer a bare „failed“', () => {
    expect(SIGN_IN_ERRORS).toEqual(
      expect.arrayContaining(['idp-refused', 'idp-invalid', 'claims', 'unavailable']),
    );
    expect(SIGN_IN_ERRORS).not.toContain('failed');
    expect(new Set(SIGN_IN_ERRORS).size).toBe(SIGN_IN_ERRORS.length);
  });

  it.each(['failed', '', 'Bug', '<script>', null, 5])('refuses %j', (value) => {
    expect(isSignInError(value)).toBe(false);
  });
});

describe('isFailureCause', () => {
  it('knows every cause and nothing else', () => {
    for (const cause of FAILURE_CAUSES) expect(isFailureCause(cause)).toBe(true);
    for (const value of ['', 'network', 'failed', 'BUG', ' bug', null, 1]) {
      expect(isFailureCause(value)).toBe(false);
    }
  });
});

describe('isAadstsCode', () => {
  it.each(['AADSTS50011', 'AADSTS7000215', 'AADSTS12345'])('accepts %s', (value) => {
    expect(isAadstsCode(value)).toBe(true);
  });

  it.each([
    'AADSTS1234',
    'AADSTS12345678',
    'aadsts50011',
    'AADSTS50011: redirect URI mismatch',
    ' AADSTS50011',
    'AADSTS50011\n',
    'AADSTS\uff15\uff10\uff10\uff11\uff11',
    'x',
    '',
    null,
    50011,
  ])('refuses %j', (value) => {
    expect(isAadstsCode(value)).toBe(false);
  });
});
