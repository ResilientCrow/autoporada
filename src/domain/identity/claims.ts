import { stripForbiddenCharacters } from '@/domain/richtext';
import { CLOCK_SKEW_MS } from '@/domain/time';

/** Who signed in, as the app keeps it: keyed by (tid, oid), never by e-mail (ADR 0002). */
export interface EntraIdentity {
  /** Lower-case GUIDs. */
  readonly tid: string;
  readonly oid: string;
  readonly displayName: string;
  /** The `email` claim only; for display, never a key. */
  readonly email: string | null;
  readonly authTime: Date;
}

export interface ClaimExpectations {
  readonly issuer: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly now: Date;
  /** Step-up only: when the step-up started; the password must have been entered since. */
  readonly reauthenticatedAfter?: Date;
}

export const CLAIM_NAMES = ['iss', 'aud', 'tid', 'acct', 'upn', 'oid', 'auth_time'] as const;
export type ClaimName = (typeof CLAIM_NAMES)[number];

export const CLAIM_REJECTIONS = [
  'tenant',
  'guest',
  'missing-claim',
  'invalid-claim',
  'stale-auth',
] as const;
export type ClaimRejection = (typeof CLAIM_REJECTIONS)[number];

/** What marked a guest: `acct` (1 = guest) and an `#EXT#` UPN; both are set up in Entra (ENTRA-SETUP §1). */
export type GuestSignal = 'acct' | 'upn';

export type ClaimCheck =
  | { readonly ok: true; readonly identity: EntraIdentity }
  | {
      readonly ok: false;
      readonly reason: ClaimRejection;
      readonly claim: ClaimName;
      readonly signals: readonly GuestSignal[];
    };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 200;
const MAX_EMAIL = 320;

const refuse = (
  reason: ClaimRejection,
  claim: ClaimName,
  signals: GuestSignal[] = [],
): ClaimCheck => ({
  ok: false,
  reason,
  claim,
  signals,
});

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** A display name as Entra sends it, made safe for the document and the UI. */
function cleanName(value: string): string {
  return stripForbiddenCharacters(value)
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
    .slice(0, MAX_NAME);
}

function guestSignals(claims: Readonly<Record<string, unknown>>): GuestSignal[] {
  const signals: GuestSignal[] = [];
  const { acct, upn } = claims;
  if (acct !== undefined && acct !== 0 && acct !== '0') signals.push('acct');
  if (typeof upn === 'string' && /#EXT#/i.test(upn)) signals.push('upn');
  return signals;
}

/**
 * The checks of an ID token that openid-client does not do (plan §4).
 * Runs after the library has verified the signature, iss, aud, exp, nbf and
 * the nonce; iss and aud are checked again here as belt and braces. Fails
 * closed: a missing optional claim is an Entra configuration error.
 */
export function checkEntraClaims(
  claims: Readonly<Record<string, unknown>>,
  expected: ClaimExpectations,
): ClaimCheck {
  if (claims['iss'] !== expected.issuer) return refuse('invalid-claim', 'iss');
  const aud = claims['aud'];
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (audiences.length !== 1 || audiences[0] !== expected.clientId) {
    return refuse('invalid-claim', 'aud');
  }
  const tid = claims['tid'];
  if (typeof tid !== 'string' || tid.toLowerCase() !== expected.tenantId.toLowerCase()) {
    return refuse('tenant', 'tid');
  }

  const signals = guestSignals(claims);
  if (signals.length > 0) return refuse('guest', signals[0] === 'acct' ? 'acct' : 'upn', signals);
  if (claims['acct'] === undefined) return refuse('missing-claim', 'acct');
  const upn = text(claims['upn']);
  if (upn === undefined) return refuse('missing-claim', 'upn');

  const oid = claims['oid'];
  if (typeof oid !== 'string' || !GUID.test(oid)) return refuse('invalid-claim', 'oid');

  const authTime = claims['auth_time'];
  if (authTime === undefined) return refuse('missing-claim', 'auth_time');
  if (typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime <= 0) {
    return refuse('invalid-claim', 'auth_time');
  }
  const signedInAt = authTime * 1000;
  if (signedInAt > expected.now.getTime() + CLOCK_SKEW_MS)
    return refuse('invalid-claim', 'auth_time');
  const after = expected.reauthenticatedAfter;
  if (after && signedInAt < after.getTime() - CLOCK_SKEW_MS)
    return refuse('stale-auth', 'auth_time');

  const email = text(claims['email']);
  const name = text(claims['name']) ?? text(claims['preferred_username']) ?? upn;
  return {
    ok: true,
    identity: {
      tid: tid.toLowerCase(),
      oid: oid.toLowerCase(),
      displayName: cleanName(name) || cleanName(upn),
      email: email && email.length <= MAX_EMAIL && email.includes('@') ? email : null,
      authTime: new Date(signedInAt),
    },
  };
}
