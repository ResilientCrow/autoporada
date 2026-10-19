import { defineSystemUseCase, ok } from '@/application/core';
import { beginSignInInput, beginSignInOutput } from '@/contracts';
import { safeReturnTo, SIGN_IN_TTL_MS } from '@/domain/identity';

/** Old sign-ins removed per new one, so abandoned rows never pile up. */
const PURGE_BATCH = 100;

/**
 * Remembers a sign-in about to leave for Entra (anonymous: GET /auth/login).
 * Protocol state only: not audited.
 */
export const beginLogin = defineSystemUseCase({
  name: 'auth.beginLogin',
  reasons: ['auth.login'],
  mode: 'write',
  input: beginSignInInput,
  output: beginSignInOutput,
  async execute({ tx, now }, input) {
    await tx.signIns.purgeExpired(PURGE_BATCH);
    await tx.signIns.save(input.cookieSha256, {
      purpose: 'login',
      userId: null,
      returnTo: safeReturnTo(input.returnTo),
      state: input.state,
      nonce: input.nonce,
      codeVerifier: input.codeVerifier,
      expiresAt: new Date(now.getTime() + SIGN_IN_TTL_MS),
    });
    return ok({});
  },
});
