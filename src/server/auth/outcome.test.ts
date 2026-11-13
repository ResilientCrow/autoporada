import { describe, expect, it } from 'vitest';

import { causeOfRefusal, signInError, signInFailed } from './outcome';

const ORIGIN = 'https://autoporada.ssps.cz';
const query = (href: string) => {
  const url = new URL(href);
  expect(url.origin).toBe(ORIGIN);
  // The Arch client at `/` says it, signed out on its sign-in screen and signed in as a notice.
  expect(url.pathname).toBe('/');
  return [...url.searchParams];
};

describe('signInFailed', () => {
  it('names the error alone, never a request id', () => {
    for (const error of ['unavailable', 'bug', 'signout-failed', 'claims'] as const) {
      expect(query(signInFailed(ORIGIN, error))).toEqual([['chyba', error]]);
    }
  });

  it('sends a failed step-up to the Arch client too, which says it to someone signed in', () => {
    for (const error of ['step-up-mismatch', 'step-up-stale'] as const) {
      const url = new URL(signInFailed(ORIGIN, error));
      expect(url.pathname).toBe('/');
      expect([...url.searchParams]).toEqual([['chyba', error]]);
    }
  });

  it('carries a refusal’s AADSTS number', () => {
    expect(query(signInFailed(ORIGIN, 'idp-refused', { aadsts: 'AADSTS50011' }))).toEqual([
      ['chyba', 'idp-refused'],
      ['aadsts', 'AADSTS50011'],
    ]);
  });

  it.each([
    'AADSTS50011: redirect URI mismatch for jana@ssps.cz',
    'AADSTS1',
    'AADSTS50011&kod=x',
    'jana@ssps.cz',
  ])('drops an AADSTS value that is not just the number: %j', (aadsts) => {
    expect(query(signInFailed(ORIGIN, 'idp-refused', { aadsts }))).toEqual([
      ['chyba', 'idp-refused'],
    ]);
  });

  it('carries the AADSTS number only with a refusal', () => {
    expect(query(signInFailed(ORIGIN, 'idp-invalid', { aadsts: 'AADSTS50011' }))).toEqual([
      ['chyba', 'idp-invalid'],
    ]);
  });

  it('carries a failed sign-out’s cause, and only a known one', () => {
    expect(query(signInFailed(ORIGIN, 'signout-failed', { cause: 'database-down' }))).toEqual([
      ['chyba', 'signout-failed'],
      ['pricina', 'database-down'],
    ]);
    expect(query(signInFailed(ORIGIN, 'bug', { cause: 'database-down' }))).toEqual([
      ['chyba', 'bug'],
    ]);
    const junk = { cause: 'evil' } as unknown as { cause: 'bug' };
    expect(query(signInFailed(ORIGIN, 'signout-failed', junk))).toEqual([
      ['chyba', 'signout-failed'],
    ]);
  });
});

describe('signInError', () => {
  it.each([
    ['cancelled', 'cancelled'],
    ['unavailable', 'unavailable'],
    ['idp-error', 'idp-refused'],
    ['invalid-response', 'idp-invalid'],
  ] as const)('shows Entra’s %s as %s', (failure, shown) => {
    expect(signInError(failure)).toBe(shown);
  });
});

describe('causeOfRefusal', () => {
  it('reads a busy database as a timeout', () => {
    expect(causeOfRefusal({ code: 'busy' })).toBe('timeout');
  });

  it('keeps the cause of an unavailable answer', () => {
    expect(causeOfRefusal({ code: 'unavailable', cause: 'database-setup' })).toBe('database-setup');
  });

  it.each([
    { code: 'unauthenticated' },
    { code: 'forbidden' },
    { code: 'conflict' },
    { code: 'not-found' },
    { code: 'step-up-required' },
    { code: 'invalid-input', fields: {} },
    { code: 'rule', rule: 'point.closed' },
    { code: 'rate-limited', retryAfterSeconds: 1 },
  ] as const)('reads any other refusal as a bug: %o', (error) => {
    expect(causeOfRefusal(error as never)).toBe('bug');
  });
});
