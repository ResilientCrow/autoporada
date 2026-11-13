import { z } from 'zod';

import { ROLES, USER_STATUSES } from '@/domain/actor';
import { CLAIM_NAMES, CLAIM_REJECTIONS } from '@/domain/identity';

import { FAILURE_CAUSES, type FailureCause } from './failure';

/** Digests travel as 64 lower-case hex characters; raw tokens never reach a use case. */
const sha256Hex = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/);
/** state, nonce and the PKCE verifier: 32 random bytes, base64url. */
const token43 = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{43}$/);
const purpose = z.enum(['login', 'step_up']);

export const beginSignInInput = z.strictObject({
  cookieSha256: sha256Hex,
  state: token43,
  nonce: token43,
  codeVerifier: token43,
  returnTo: z.string().max(512),
});
export const beginSignInOutput = z.object({});

export const takeSignInInput = z.strictObject({ cookieSha256: sha256Hex, state: token43 });
/** Protocol state for the token exchange on the server; never sent to a browser. */
export const takeSignInOutput = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    expired: z.boolean(),
    purpose,
    userId: z.guid().nullable(),
    returnTo: z.string(),
    startedAtMs: z.number().int(),
    nonce: z.string(),
    codeVerifier: z.string(),
  }),
]);

export const completeSignInInput = z.strictObject({
  purpose,
  identity: z.strictObject({
    tid: z.guid(),
    oid: z.guid(),
    displayName: z.string().min(1).max(200),
    email: z.string().max(320).nullable(),
  }),
  /** Epoch seconds, as Entra's auth_time. */
  authTime: z.number().int().positive(),
  sessionTokenSha256: sha256Hex,
  /** The browser's current session, ended so a sign-in never inherits it (fixation). */
  replacesSessionSha256: sha256Hex.nullable(),
  /** Step-up only: who must be signing in again. */
  expectedUserId: z.guid().nullable(),
  bootstrapHeadmasterOid: z.guid().nullable(),
});
export const completeSignInOutput = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('signed-in'), userId: z.guid(), bootstrapped: z.boolean() }),
  z.object({ outcome: z.literal('refused'), reason: z.enum(['inactive', 'other-account']) }),
]);

export const recordRejectionInput = z.strictObject({
  reason: z.enum(CLAIM_REJECTIONS),
  claim: z.enum(CLAIM_NAMES),
  signals: z.array(z.enum(['acct', 'upn'])).max(2),
  purpose,
  userId: z.guid().nullable(),
});
export const recordRejectionOutput = z.object({});

export const resolveSessionInput = z.strictObject({ tokenSha256: sha256Hex });
export const resolveSessionOutput = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    sessionId: z.guid(),
    authTime: z.iso.datetime(),
    actor: z.object({
      id: z.guid(),
      role: z.enum(ROLES),
      status: z.enum(USER_STATUSES),
      isStudent: z.boolean(),
    }),
  }),
]);

export const signOutInput = z.strictObject({ everywhere: z.boolean() });
export const signOutOutput = z.object({ ended: z.number().int() });

/**
 * Why a sign-in, or a sign-out, did not finish, as `/?chyba=…` names it (ADR 0044);
 * Czech copy in ui/copy. Entra's answers have their own kinds, and anything that broke in the app
 * is its failure cause, so a new cause is a sign-in error too.
 */
const SIGN_IN_OUTCOMES = [
  'expired',
  'cancelled',
  'not-member',
  'blocked',
  'step-up-mismatch',
  'step-up-stale',
  /** Entra is unreachable or says it is down. */
  'unavailable',
  /** Entra refused the request (an OAuth error); may carry its AADSTS number. */
  'idp-refused',
  /** Entra's answer did not verify: a token, a signature or a document. */
  'idp-invalid',
  /** The ID token lacks a claim the app needs, or one is malformed. */
  'claims',
  'signout-failed',
] as const;

export type SignInError = (typeof SIGN_IN_OUTCOMES)[number] | FailureCause;

export const SIGN_IN_ERRORS: readonly SignInError[] = [...SIGN_IN_OUTCOMES, ...FAILURE_CAUSES];

export const isSignInError = (value: unknown): value is SignInError =>
  (SIGN_IN_ERRORS as readonly unknown[]).includes(value);

/** Entra's error number, e.g. AADSTS50011: public, and what the administrator looks up. */
const AADSTS_CODE = /^AADSTS\d{5,7}$/;

/** Whether `value` is an AADSTS number and nothing else, so it may go into a URL and onto the page. */
export const isAadstsCode = (value: unknown): value is string =>
  typeof value === 'string' && AADSTS_CODE.test(value);
