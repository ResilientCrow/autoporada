import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { checkEntraClaims, type ClaimExpectations } from './index';

const TENANT = '3f2c1a4e-0000-4000-8000-000000000000';
const CLIENT = '11111111-2222-4333-8444-555555555555';
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const NOW = new Date('2026-10-19T10:00:00Z');
const NOW_S = NOW.getTime() / 1000;
const expected: ClaimExpectations = {
  issuer: ISSUER,
  clientId: CLIENT,
  tenantId: TENANT,
  now: NOW,
};

const member = {
  iss: ISSUER,
  aud: CLIENT,
  tid: TENANT,
  oid: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',
  acct: 0,
  upn: 'jana.novakova@ssps.cz',
  name: 'Jana Nováková',
  email: 'jana.novakova@ssps.cz',
  auth_time: NOW_S - 120,
};
const without = (key: keyof typeof member) => {
  const claims: Record<string, unknown> = { ...member };
  delete claims[key];
  return claims;
};

describe('checkEntraClaims', () => {
  it('accepts a member and keys them by lower-case (tid, oid)', () => {
    expect(checkEntraClaims(member, expected)).toEqual({
      ok: true,
      identity: {
        tid: TENANT,
        oid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        displayName: 'Jana Nováková',
        email: 'jana.novakova@ssps.cz',
        authTime: new Date((NOW_S - 120) * 1000),
      },
    });
    expect(checkEntraClaims({ ...member, acct: '0', aud: [CLIENT] }, expected).ok).toBe(true);
  });

  it.each([
    [
      'another issuer',
      { iss: 'https://login.microsoftonline.com/common/v2.0' },
      'invalid-claim',
      'iss',
    ],
    ['another audience', { aud: 'someone-else' }, 'invalid-claim', 'aud'],
    ['two audiences', { aud: [CLIENT, 'other'] }, 'invalid-claim', 'aud'],
    ['another tenant', { tid: '99999999-0000-4000-8000-000000000000' }, 'tenant', 'tid'],
    ['a non-GUID oid', { oid: 'jana' }, 'invalid-claim', 'oid'],
    ['a fractional auth_time', { auth_time: NOW_S - 0.5 }, 'invalid-claim', 'auth_time'],
    ['an auth_time as text', { auth_time: String(NOW_S) }, 'invalid-claim', 'auth_time'],
    ['an auth_time in the future', { auth_time: NOW_S + 61 }, 'invalid-claim', 'auth_time'],
  ])('refuses %s', (_name, change, reason, claim) => {
    expect(checkEntraClaims({ ...member, ...change }, expected)).toEqual({
      ok: false,
      reason,
      claim,
      signals: [],
    });
  });

  it.each([
    ['acct = 1', { acct: 1 }, ['acct']],
    ['an #EXT# UPN', { upn: 'x_gmail.com#ext#@ssps.cz' }, ['upn']],
    ['both', { acct: 1, upn: 'x_gmail.com#EXT#@ssps.cz' }, ['acct', 'upn']],
  ])('refuses a guest marked by %s', (_name, change, signals) => {
    expect(checkEntraClaims({ ...member, ...change }, expected)).toMatchObject({
      ok: false,
      reason: 'guest',
      signals,
    });
  });

  it.each([['acct'], ['upn'], ['auth_time']] as const)(
    'fails closed without %s: Entra is not set up as ENTRA-SETUP says',
    (claim) => {
      expect(checkEntraClaims(without(claim), expected)).toEqual({
        ok: false,
        reason: 'missing-claim',
        claim,
        signals: [],
      });
    },
  );

  it('checks the tenant before anything about the account', () => {
    const foreignGuest = { ...member, tid: '99999999-0000-4000-8000-000000000000', acct: 1 };
    expect(checkEntraClaims(foreignGuest, expected)).toMatchObject({ reason: 'tenant' });
  });

  it('accepts a step-up only if the password was entered after it started', () => {
    const started = new Date(NOW.getTime() - 30_000);
    const stepUp = { ...expected, reauthenticatedAfter: started };
    expect(checkEntraClaims({ ...member, auth_time: NOW_S - 10 }, stepUp).ok).toBe(true);
    // A minute of clock skew is tolerated.
    expect(checkEntraClaims({ ...member, auth_time: NOW_S - 90 }, stepUp).ok).toBe(true);
    expect(checkEntraClaims({ ...member, auth_time: NOW_S - 91 }, stepUp)).toMatchObject({
      reason: 'stale-auth',
      claim: 'auth_time',
    });
  });

  it('takes the display name from name, then preferred_username, then the UPN, made safe', () => {
    const named = (extra: Record<string, unknown>) => {
      const result = checkEntraClaims({ ...without('name'), ...extra }, expected);
      return result.ok ? result.identity.displayName : result.reason;
    };
    expect(named({ preferred_username: 'jana@ssps.cz' })).toBe('jana@ssps.cz');
    expect(named({})).toBe('jana.novakova@ssps.cz');
    expect(named({ name: '  Jana \n Nováková ' })).toBe('Jana Nováková');
    expect(named({ name: 'x'.repeat(300) })).toHaveLength(200);
  });

  it('keeps an e-mail only if it looks like one', () => {
    const email = (value: unknown) => {
      const result = checkEntraClaims({ ...member, email: value }, expected);
      return result.ok ? result.identity.email : result.reason;
    };
    expect(email('not an address')).toBeNull();
    expect(email(`${'x'.repeat(320)}@ssps.cz`)).toBeNull();
    expect(email(undefined)).toBeNull();
  });

  it('never accepts a guest, another tenant or a malformed oid, whatever else is sent', () => {
    fc.assert(
      fc.property(
        fc.record({
          tid: fc.constantFrom(
            TENANT,
            TENANT.toUpperCase(),
            '99999999-0000-4000-8000-000000000000',
          ),
          acct: fc.constantFrom(0, '0', 1, '1', 2, undefined),
          upn: fc.constantFrom('a@ssps.cz', 'a_b.cz#EXT#@ssps.cz', undefined, ''),
          oid: fc.oneof(fc.uuid(), fc.string({ maxLength: 40 })),
          auth_time: fc.oneof(fc.integer({ min: -10, max: NOW_S + 600 }), fc.constant(undefined)),
        }),
        (varied) => {
          const result = checkEntraClaims({ ...member, ...varied }, expected);
          if (!result.ok) return;
          expect(result.identity.tid).toBe(TENANT);
          expect([0, '0']).toContain(varied.acct);
          expect(varied.upn).not.toMatch(/#EXT#/i);
          expect(result.identity.oid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          );
        },
      ),
    );
  });
});
